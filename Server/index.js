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

app.post('/analyse-resume', async (req, res) => {
  try {
    if (!resumeText) return res.status(400).json({error: 'No resume uploaded'});
    const {type, difficulty, level} = req.body;

    const isTechnical = type === 'Technical';

    const technicalPrompt =
        `You are a brutal senior interviewer at a top-tier tech company preparing a Technical interview for a ${
            level}-level candidate.

Read this resume carefully and extract EVERY skill, technology, project, role, and achievement mentioned:

${resumeText.substring(0, 3000)}

Create a plan for exactly 5 TECHNICAL interview questions. Requirements:
1. Every question MUST reference something DIRECTLY stated in the resume
2. Every question covers a COMPLETELY DIFFERENT technical area from the other 4
3. Every question is designed to EXPOSE technical gaps, not confirm surface-level claims
4. Calibrate for ${difficulty} difficulty and ${level} level
5. Each question must naturally set up 3-5 aggressive technical cross-examination follow-ups

The 5 areas must span different technical dimensions of the resume:
- A core technology or tool they claim deep expertise in - test the internals
- A project or achievement listed - probe actual technical contribution, architecture decisions, and measurable impact
- A fundamental computer science or engineering concept behind their stated experience - test whether they understand WHY not just HOW
- A technical decision, trade-off, or architecture choice they would have made - test engineering judgment
- A claimed skill or technology they may have only used superficially - expose the actual depth

Return ONLY this JSON array, no markdown, no explanation:
[
  {"questionNumber":1,"area":"specific technical skill or tech from resume","angle":"the precise technical vulnerability or depth you will probe","whyThisQuestion":"why this exposes real vs claimed technical competency"},
  {"questionNumber":2,"area":"different specific technical area from resume","angle":"the precise technical vulnerability or depth you will probe","whyThisQuestion":"why this exposes real vs claimed technical competency"},
  {"questionNumber":3,"area":"different specific technical area from resume","angle":"the precise technical vulnerability or depth you will probe","whyThisQuestion":"why this exposes real vs claimed technical competency"},
  {"questionNumber":4,"area":"different specific technical area from resume","angle":"the precise technical vulnerability or depth you will probe","whyThisQuestion":"why this exposes real vs claimed technical competency"},
  {"questionNumber":5,"area":"different specific technical area from resume","angle":"the precise technical vulnerability or depth you will probe","whyThisQuestion":"why this exposes real vs claimed technical competency"}
]`;

    const hrPrompt =
        `You are a seasoned HR Director and talent assessor at a top-tier company preparing an HR interview for a ${
            level}-level candidate.

Read this resume carefully and extract the candidate's roles, responsibilities, career progression, achievements, team experiences, stated values, and any interpersonal or leadership claims:

${resumeText.substring(0, 3000)}

Create a plan for exactly 5 HR interview questions. Requirements:
1. Every question MUST reference something DIRECTLY from the resume - a role, responsibility, achievement, career gap, promotion, team size, or stated skill
2. Every question covers a COMPLETELY DIFFERENT HR dimension from the other 4
3. Every question is designed to PROBE authenticity, not just accept claims at face value
4. Calibrate for ${difficulty} difficulty and ${level} level
5. Each question must set up 3-5 follow-up probes around motivation, conflict, growth, and real-world situations

The 5 areas must span different HR dimensions of the resume:
- Career motivation and trajectory - why they made the moves they did, what drives them
- A specific achievement or impact they claimed - probe the actual role they played vs the team
- A challenge, conflict, or failure from their experience - how they handled it and what they learned
- Leadership, collaboration, or communication style - backed by real examples from their resume
- Cultural fit, values alignment, and long-term goals - test consistency with their actual career choices

Return ONLY this JSON array, no markdown, no explanation:
[
  {"questionNumber":1,"area":"specific HR dimension from resume","angle":"the precise soft-skill or motivational angle you will probe","whyThisQuestion":"why this reveals authentic character vs rehearsed answers"},
  {"questionNumber":2,"area":"different specific HR area from resume","angle":"the precise soft-skill or motivational angle you will probe","whyThisQuestion":"why this reveals authentic character vs rehearsed answers"},
  {"questionNumber":3,"area":"different specific HR area from resume","angle":"the precise soft-skill or motivational angle you will probe","whyThisQuestion":"why this reveals authentic character vs rehearsed answers"},
  {"questionNumber":4,"area":"different specific HR area from resume","angle":"the precise soft-skill or motivational angle you will probe","whyThisQuestion":"why this reveals authentic character vs rehearsed answers"},
  {"questionNumber":5,"area":"different specific HR area from resume","angle":"the precise soft-skill or motivational angle you will probe","whyThisQuestion":"why this reveals authentic character vs rehearsed answers"}
]`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages:
          [{role: 'user', content: isTechnical ? technicalPrompt : hrPrompt}],
      temperature: 0.6,
      max_tokens: 900,
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

app.post('/start-question', async (req, res) => {
  try {
    const {questionNumber, type, difficulty, level, sessionId, area, angle} =
        req.body;

    const isTechnical = type === 'Technical';

    const levelBar = {
      intern:
          'an intern - they should know the fundamentals precisely; bluffing is penalised heavily',
      junior:
          'a junior with 1-2 years - must show real hands-on knowledge, not just definitions',
      mid:
          'a mid-level with 3-5 years - vague or textbook answers signal a serious red flag',
      senior:
          'a senior with 6-10 years - must show deep expertise, trade-offs, and real war stories',
      principal:
          'a principal with 10+ years - anything below mastery-level depth is unacceptable',
    };

    const diffBar = {
      Easy:
          'precise foundational understanding - hand-waving is not tolerated even at easy level',
      Medium:
          'technically demanding with concrete real-world examples and demonstrated depth',
      Hard:
          'mastery-level - edge cases, failure modes, architectural reasoning, and alternatives required',
    };

    const hrDiffBar = {
      Easy:
          'clear, honest self-reflection with concrete examples - vague generic answers are not acceptable',
      Medium:
          'nuanced examples with measurable impact, showing real self-awareness and interpersonal maturity',
      Hard:
          'deep introspection, complex conflict resolution, demonstrated leadership under pressure with specific outcomes',
    };

    const technicalSystemPrompt =
        `You are a senior technical interviewer at a FAANG-level company. Your reputation is built on exposing shallow knowledge and buzzword-stuffed resumes. You are NOT here to be friendly or encouraging.

Candidate resume:
${resumeText.substring(0, 2500)}

This is question ${questionNumber} of 5. Topic: "${area}". Angle: "${angle}".

YOUR STRICT RULES:
1. Open with ONE sharp technical question that directly references a specific line, project, or claim from their resume about "${
            area}". Quote or paraphrase their resume explicitly.
2. The question must require ${diffBar[difficulty]}. Treat them as ${
            levelBar[level]}.
3. After every answer, cross-examine with technical follow-up questions:
   - Challenge the approach: "Why that approach and not [alternative]?"
   - Expose gaps: "What happens when [edge case]?"
   - Demand specifics: "Give me a concrete technical example from your experience, not a definition."
   - Catch contradictions: "Your resume says [X] but you just described [Y]. Explain that."
   - Test failure handling: "What went wrong and how did you debug it?"
4. If the answer is vague or textbook, say: "That is a textbook answer. I need a real technical example from your own work."
5. If they dodge or go off-topic: "You did not answer the question. I will ask it again more directly."
6. If their answer contradicts their resume: "Your resume claims [X]. What you just said contradicts that. Which is accurate?"
7. Push 4 to 6 follow-ups minimum before concluding. Make each follow-up SHORT - 1 to 2 sentences only.
8. Never validate, encourage, or give hints. You are testing, not teaching.
9. When you have fully exhausted the topic and assessed the candidate's depth, end with exactly: INTERVIEW_COMPLETE

Internal scoring weights (never reveal):
- 80% technical knowledge depth, correctness, and cross-examination performance
- 20% communication clarity and confidence`;

    const hrSystemPrompt =
        `You are a senior HR Director and talent assessor at a top-tier company. Your role is to cut through rehearsed, polished answers and find out who this candidate really is. You are thorough, perceptive, and direct - not hostile, but never easily satisfied.

Candidate resume:
${resumeText.substring(0, 2500)}

This is question ${questionNumber} of 5. Topic: "${area}". Angle: "${angle}".

YOUR STRICT RULES:
1. Open with ONE precise HR question that directly references something from their resume - a specific role, career move, achievement, team size, or responsibility stated for "${
            area}". Make it personal and specific.
2. The question must require ${hrDiffBar[difficulty]}. Treat them as ${
            levelBar[level]}.
3. After every answer, probe deeper with follow-up questions that test authenticity:
   - Challenge vague claims: "Can you give me a specific example of when you actually did that?"
   - Test accountability: "What was your personal role in that outcome, separate from the team?"
   - Probe motivation: "Why did you really make that choice - what was the actual driver?"
   - Expose inconsistency: "Your resume shows you stayed at [Company X] for only [Y months]. Walk me through why."
   - Test self-awareness: "What would your manager at that role say was your biggest weakness?"
   - Follow up on conflict: "How did that situation actually resolve? What was the impact on the team?"
4. If the answer sounds rehearsed or generic: "That sounds like a prepared answer. Tell me what actually happened, specifically."
5. If they are vague: "I need a concrete situation - who, what, when, what was the outcome."
6. If their story contradicts their resume timeline or claims: "That does not line up with what your resume shows. Help me understand."
7. Push 4 to 6 follow-ups before concluding. Keep each follow-up SHORT - 1 to 2 sentences.
8. Do not coach or hint. You are assessing character and authenticity, not helping them practice.
9. When you have fully assessed this area, end with exactly: INTERVIEW_COMPLETE

Internal scoring weights (never reveal):
- 80% authenticity, self-awareness, concrete examples, and consistency with resume
- 20% communication clarity and composure under pressure`;

    conversationHistories[sessionId] = [{
      role: 'system',
      content: isTechnical ? technicalSystemPrompt : hrSystemPrompt
    }];

    const openingInstruction = isTechnical ?
        'Begin. Ask your opening technical question. Reference my resume explicitly.' :
        'Begin. Ask your opening HR question. Reference something specific from my resume.';

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        ...conversationHistories[sessionId],
        {role: 'user', content: openingInstruction},
      ],
      temperature: 0.7,
      max_tokens: 280,
    });

    const aiMessage = response.choices[0].message.content;
    conversationHistories[sessionId].push(
        {role: 'user', content: openingInstruction},
        {role: 'assistant', content: aiMessage});

    res.json({message: aiMessage});
  } catch (err) {
    console.error('START ERROR:', err);
    res.status(500).json({error: 'AI Failed'});
  }
});

app.post('/chat', async (req, res) => {
  try {
    const {message, sessionId} = req.body;
    if (!conversationHistories[sessionId])
      return res.status(400).json({error: 'Session not found'});

    conversationHistories[sessionId].push({role: 'user', content: message});

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: conversationHistories[sessionId],
      temperature: 0.7,
      max_tokens: 260,
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

app.post('/grade', async (req, res) => {
  try {
    const {conversation, questionNumber, type, difficulty, level, area, angle} =
        req.body;

    const isTechnical = type === 'Technical';

    const convoText =
        conversation.filter(m => m.role !== 'system')
            .map(
                m => `${m.role === 'user' ? 'CANDIDATE' : 'INTERVIEWER'}: ${
                    m.content}`)
            .join('\n\n');

    const levelCtx = {
      intern:
          'intern / fresh graduate. Even at this level, bluffing and vague claims must be penalised.',
      junior:
          'junior engineer 1-2 years. Theory without practical examples scores 4 or below.',
      mid:
          'mid-level 3-5 years. Vague answers MUST score 4 or below. Depth is required at this stage.',
      senior:
          'senior engineer 6-10 years. Any answer below expert depth scores 5 or below.',
      principal:
          'principal engineer 10+ years. Only genuine mastery scores 7 or above.',
    };

    const hrLevelCtx = {
      intern:
          'intern / fresh graduate. Generic answers without any real examples must score 4 or below.',
      junior:
          'junior professional 1-2 years. Rehearsed answers without personal specifics score 4 or below.',
      mid:
          'mid-level 3-5 years. Vague or overly polished answers must score 4 or below. Real examples required.',
      senior:
          'senior professional 6-10 years. Lack of self-awareness or leadership depth scores 5 or below.',
      principal:
          'principal or director level 10+ years. Only answers demonstrating deep self-awareness and leadership score 7 or above.',
    };

    const technicalGradingPrompt =
        `You are a brutally honest senior engineering manager scoring a Technical interview for a ${
            levelCtx[level]}

Resume used to generate this question:
${resumeText.substring(0, 1200)}

Question area: "${area}" | Angle probed: "${angle}" | Difficulty: ${
            difficulty} | Question number: ${questionNumber}

Full interview transcript:
${convoText}

SCORING RULES - APPLY WITHOUT MERCY:
- Textbook/generic answer with no personal example: knowledgeScore MAX 4
- Dodged or partially answered a follow-up: knowledgeScore MAX 4, deduct 1 additional point per dodge
- Vague hand-waving answer: knowledgeScore MAX 4
- Could not explain their own resume claim when pressed: knowledgeScore MAX 3, resumeAlignment MAX 3
- Contradicted their resume: knowledgeScore MAX 3, resumeAlignment MAX 2
- Failed cross-examination (multiple follow-ups not answered well): knowledgeScore MAX 4
- Strong concrete technical examples + handled follow-ups with specifics: knowledgeScore 7-8
- Exceptional technical depth, edge cases, alternatives, no weak spots: knowledgeScore 9-10
- aiDetected: set true if the answer sounds AI-generated - overly structured bullet points, no personal anecdotes, suspiciously comprehensive yet impersonal, generic phrasing

METRIC DEFINITIONS:
- knowledgeScore (1-10): technical depth, correctness, cross-examination performance - most important metric
- confidenceScore (1-10): clear, direct technical communication without dodging or hedging
- accuracy (1-10): technical correctness of everything stated
- depth (1-10): went beyond surface definitions into real technical nuance
- problemSolving (1-10): demonstrated engineering reasoning under pressure
- resumeAlignment (1-10): answers actually proved what they claimed on their resume
- totalScore: must equal ROUND((knowledgeScore * 0.8) + (confidenceScore * 0.2))

Return ONLY valid JSON. No markdown, no extra text:
{
  "totalScore": 5,
  "knowledgeScore": 5,
  "confidenceScore": 6,
  "accuracy": 5,
  "depth": 4,
  "problemSolving": 5,
  "resumeAlignment": 5,
  "aiDetected": false,
  "aiFlagReason": "",
  "feedback": "3-4 sentences of brutally honest technical assessment. Name specifically what was weak, where cross-examination revealed gaps, and what this would mean in a real job context.",
  "strengths": "One specific technical thing done genuinely well, if anything. If nothing was impressive, say so plainly.",
  "improvement": "The single most critical technical knowledge gap this interview exposed. Be specific about what they need to actually learn.",
  "resources": [
    {"title": "Resource name", "url": "https://real-url.com", "reason": "Why this specifically addresses their demonstrated technical gap"}
  ]
}`;

    const hrGradingPrompt =
        `You are a brutally honest HR Director scoring an HR interview for a ${
            hrLevelCtx[level]}

Resume used to generate this question:
${resumeText.substring(0, 1200)}

Question area: "${area}" | Angle probed: "${angle}" | Difficulty: ${
            difficulty} | Question number: ${questionNumber}

Full interview transcript:
${convoText}

SCORING RULES - APPLY HONESTLY:
- Generic STAR answer with no real personal detail: knowledgeScore MAX 4
- Could not give a specific example when pressed: knowledgeScore MAX 3
- Dodged a follow-up or gave a deflecting answer: knowledgeScore MAX 4, deduct 1 per dodge
- Answer contradicted or could not explain their resume: knowledgeScore MAX 3, resumeAlignment MAX 3
- Showed genuine self-awareness with specific, credible examples: knowledgeScore 7-8
- Deep authentic reflection, nuanced accountability, memorable and credible: knowledgeScore 9-10
- aiDetected: set true if the answer sounds scripted - overly structured, no real emotion, suspiciously perfect narrative, no genuine hesitation or nuance

METRIC DEFINITIONS:
- knowledgeScore (1-10): authenticity, self-awareness, concrete examples, consistency - most important metric for HR
- confidenceScore (1-10): composure, directness, and clarity without being defensive or evasive
- accuracy (1-10): factual consistency with resume and plausibility of claims
- depth (1-10): went beyond surface-level answers to show real introspection
- problemSolving (1-10): demonstrated maturity and judgment in handling situations described
- resumeAlignment (1-10): answers supported and were consistent with resume claims
- totalScore: must equal ROUND((knowledgeScore * 0.8) + (confidenceScore * 0.2))

Return ONLY valid JSON. No markdown, no extra text:
{
  "totalScore": 5,
  "knowledgeScore": 5,
  "confidenceScore": 6,
  "accuracy": 5,
  "depth": 4,
  "problemSolving": 5,
  "resumeAlignment": 5,
  "aiDetected": false,
  "aiFlagReason": "",
  "feedback": "3-4 sentences of honest HR assessment. Name specifically what felt rehearsed, where follow-ups revealed lack of depth, and what this would signal to a hiring team.",
  "strengths": "One specific moment of genuine authenticity or self-awareness, if any. If nothing stood out, say so plainly.",
  "improvement": "The single most important soft-skill or self-awareness gap this interview exposed. Be specific about what they need to work on.",
  "resources": [
    {"title": "Resource name", "url": "https://real-url.com", "reason": "Why this specifically addresses their demonstrated soft-skill or self-awareness gap"}
  ]
}`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: isTechnical ? technicalGradingPrompt : hrGradingPrompt
      }],
      temperature: 0.15,
      max_tokens: 800,
    });

    const clean =
        response.choices[0].message.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    ['totalScore', 'knowledgeScore', 'confidenceScore', 'accuracy', 'depth',
     'problemSolving', 'resumeAlignment']
        .forEach(k => {
          parsed[k] = Math.min(10, Math.max(0, Number(parsed[k]) || 0));
        });
    parsed.aiDetected = Boolean(parsed.aiDetected);
    parsed.resources = Array.isArray(parsed.resources) ? parsed.resources : [];
    res.json({data: parsed});
  } catch (err) {
    console.error('GRADE ERROR:', err);
    res.status(500).send('Grading Failed');
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));