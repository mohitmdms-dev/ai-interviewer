const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const mammoth = require('mammoth');
const Groq = require('groq-sdk');

dotenv.config();
const app = express();
const upload = multer();
const groq = new Groq({apiKey: process.env.GROQ_API_KEY});

app.use(cors({origin: 'http://localhost:3000'}));
app.use(express.json());

let resumeText = '';
let conversationHistories = {};

// ─── RESUME UPLOAD ─────────────────────────────────────────
app.post('/upload-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const result = await mammoth.extractRawText({buffer: req.file.buffer});
    resumeText = result.value.trim();
    if (!resumeText || resumeText.length < 20) {
      resumeText = '';
      return res.json({hasText: false});
    }
    res.json({hasText: true});
  } catch {
    resumeText = '';
    res.json({hasText: false});
  }
});

// ─── ANALYSE RESUME → RETURN 5 QUESTION PLANS ──────────────
app.post('/analyse-resume', async (req, res) => {
  try {
    if (!resumeText) return res.status(400).json({error: 'No resume uploaded'});
    const {type, difficulty, level} = req.body;

    const prompt = `You are a senior interviewer preparing a ${
        type} interview for a ${level}-level candidate.

Carefully read this resume and extract EVERY skill, technology, project, role, achievement, and experience mentioned:

${resumeText.substring(0, 3000)}

Now create a plan for exactly 5 interview questions. Each question MUST:
1. Be based on something DIRECTLY mentioned in the resume above
2. Cover a COMPLETELY DIFFERENT area than the other 4 questions
3. Test DEEP understanding, not just surface knowledge
4. Be appropriate for ${difficulty} difficulty and ${level} level

The 5 areas must span different dimensions like:
- A specific technology or skill from their resume
- A project or achievement they listed
- A concept underlying their stated experience
- A professional/situational scenario from their background
- A knowledge gap or depth check on something they claim expertise in

Return ONLY this exact JSON array, no markdown:
[
  {"questionNumber":1,"area":"exact skill/tech from resume","angle":"what aspect you will probe","whyThisQuestion":"why this is relevant to their specific resume"},
  {"questionNumber":2,"area":"different area from resume","angle":"what aspect you will probe","whyThisQuestion":"why this is relevant"},
  {"questionNumber":3,"area":"different area from resume","angle":"what aspect you will probe","whyThisQuestion":"why this is relevant"},
  {"questionNumber":4,"area":"different area from resume","angle":"what aspect you will probe","whyThisQuestion":"why this is relevant"},
  {"questionNumber":5,"area":"different area from resume","angle":"what aspect you will probe","whyThisQuestion":"why this is relevant"}
]`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{role: 'user', content: prompt}],
      temperature: 0.6,
      max_tokens: 800,
    });

    const clean =
        response.choices[0].message.content.replace(/```json|```/g, '').trim();
    const plans = JSON.parse(clean);
    res.json({plans});
  } catch (err) {
    console.error('ANALYSE ERROR:', err);
    res.status(500).json({error: 'Analysis failed'});
  }
});

// ─── START QUESTION ─────────────────────────────────────────
app.post('/start-question', async (req, res) => {
  try {
    const {questionNumber, type, difficulty, level, sessionId, area, angle} =
        req.body;

    const levelDescriptions = {
      intern:
          'an intern / fresh graduate — focus on fundamentals and learning potential',
      junior:
          'a junior developer with 1-2 years — focus on practical application',
      mid:
          'a mid-level professional 3-5 years — expect architectural awareness',
      senior:
          'a senior engineer 6-10 years — expect depth, trade-offs, and leadership thinking',
      principal:
          'a principal / staff engineer 10+ years — expect visionary, strategic thinking',
    };

    const diffStyle = {
      Easy: 'clear and approachable, but still requires real understanding',
      Medium:
          'moderately complex, requiring structured thinking and real examples',
      Hard:
          'highly complex requiring depth, trade-offs, and expert-level nuance',
    };

    const systemPrompt =
        `You are a senior interviewer at a top-tier company (Google / Meta / Amazon level).
You are interviewing someone whose resume says: ${
            resumeText.substring(0, 2500)}

This is question ${questionNumber} of 5.
Area to cover: "${area}"
Angle to probe: "${angle}"

YOUR RULES:
- Ask exactly ONE question directly about "${area}" from their resume
- The question must be ${diffStyle[difficulty]}
- Treat them as ${levelDescriptions[level]}
- Reference their actual resume when asking (e.g. "I see you used X in your project Y...")
- After they answer, ask 2-4 sharp follow-up questions: probe edge cases, ask WHY, ask WHAT IF, ask for real examples from their experience
- Keep follow-ups SHORT (2-3 sentences max) — probe, do not lecture
- Never give away answers or hints
- When the topic is fully explored (3-6 exchanges), write exactly: INTERVIEW_COMPLETE

SCORING CONTEXT (don't tell candidate):
- 80% Knowledge & Correctness
- 20% Speaking Confidence

Start immediately with your question. Reference their resume. No preamble.`;

    conversationHistories[sessionId] =
        [{role: 'system', content: systemPrompt}];

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        ...conversationHistories[sessionId],
        {
          role: 'user',
          content: 'Ask your question now, referencing my resume.'
        },
      ],
      temperature: 0.8,
      max_tokens: 350,
    });

    const aiMessage = response.choices[0].message.content;
    conversationHistories[sessionId].push(
        {
          role: 'user',
          content: 'Ask your question now, referencing my resume.'
        },
        {role: 'assistant', content: aiMessage});

    res.json({message: aiMessage});
  } catch (err) {
    console.error('START ERROR:', err);
    res.status(500).json({error: 'AI Failed'});
  }
});

// ─── CHAT (follow-ups) ──────────────────────────────────────
app.post('/chat', async (req, res) => {
  try {
    const {message, sessionId} = req.body;
    if (!conversationHistories[sessionId])
      return res.status(400).json({error: 'Session not found'});

    conversationHistories[sessionId].push({role: 'user', content: message});

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: conversationHistories[sessionId],
      temperature: 0.72,
      max_tokens: 280,
    });

    const aiMessage = response.choices[0].message.content;
    conversationHistories[sessionId].push(
        {role: 'assistant', content: aiMessage});

    const isComplete = aiMessage.includes('INTERVIEW_COMPLETE');
    const cleanMessage = aiMessage.replace('INTERVIEW_COMPLETE', '').trim();
    res.json({message: cleanMessage, isComplete});
  } catch (err) {
    console.error('CHAT ERROR:', err);
    res.status(500).json({error: 'AI Failed'});
  }
});

// ─── GRADE ──────────────────────────────────────────────────
app.post('/grade', async (req, res) => {
  try {
    const {conversation, questionNumber, type, difficulty, level, area, angle} =
        req.body;

    const convoText =
        conversation.filter(m => m.role !== 'system')
            .map(
                m => `${m.role === 'user' ? 'Candidate' : 'Interviewer'}: ${
                    m.content}`)
            .join('\n\n');

    const levelCtx = {
      intern:
          'intern/fresh graduate — reward curiosity, fundamentals, and honesty',
      junior: 'junior (1-2 yrs) — expect practical knowledge, not just theory',
      mid:
          'mid-level (3-5 yrs) — expect solid skills and architectural awareness',
      senior:
          'senior (6-10 yrs) — expect depth, system thinking, and leadership perspective',
      principal:
          'principal (10+ yrs) — expect visionary depth and strategic clarity',
    };

    const prompt = `You are a senior engineering manager grading a ${
        type} interview for a ${levelCtx[level]}.

Resume excerpt: ${resumeText.substring(0, 1000)}

Question area: "${area}" | Angle: "${angle}" | Difficulty: ${difficulty}

Full interview exchange for Question ${questionNumber}:
${convoText}

SCORING:
- Knowledge & Correctness (80%): Did they demonstrate real depth on "${
        area}"? Did they back up resume claims? Handled follow-ups well?
- Speaking Confidence (20%): Clarity, structure, assertiveness, composure under probing
- totalScore = round((knowledgeScore * 0.8) + (confidenceScore * 0.2))

HONESTY RULE: Be strict and fair. If answers were vague or didn't back up their resume claims, score accordingly.

Return ONLY valid JSON, no markdown:
{"totalScore":7,"knowledgeScore":8,"confidenceScore":6,"accuracy":8,"depth":7,"problemSolving":7,"resumeAlignment":8,"aiDetected":false,"aiFlagReason":"","feedback":"3-4 sentences of honest, specific feedback referencing their resume and actual answers.","strengths":"Specific thing they did well.","improvement":"The most important thing to improve.","resources":[{"title":"Name","url":"https://real.com","reason":"Why helpful for this specific area"}]}

- All scores 1-10 integers
- resumeAlignment: how well their answers backed up what was on their resume (1-10)
- resources: 2-3 REAL websites relevant to "${area}"`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{role: 'user', content: prompt}],
      temperature: 0.25,
      max_tokens: 700,
    });

    const clean =
        response.choices[0].message.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    ['totalScore', 'knowledgeScore', 'confidenceScore', 'accuracy', 'depth',
     'problemSolving', 'resumeAlignment']
        .forEach(k => {
          parsed[k] = Number(parsed[k]) || 0;
        });
    parsed.aiDetected = Boolean(parsed.aiDetected);
    parsed.resources = parsed.resources || [];
    res.json({data: parsed});
  } catch (err) {
    console.error('GRADE ERROR:', err);
    res.status(500).send('Grading Failed');
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));