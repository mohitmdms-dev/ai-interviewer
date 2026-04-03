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
- A project or achievement listed - probe actual technical contribution and measurable impact
- A fundamental concept behind their stated experience - test whether they understand WHY not just HOW
- A technical decision or architecture choice they would have made - test engineering judgment
- A claimed skill they may have only used superficially - expose the actual depth

Return ONLY this JSON array, no markdown, no explanation:
[
  {"questionNumber":1,"area":"specific technical skill or tech from resume","angle":"the precise technical vulnerability or depth you will probe","whyThisQuestion":"why this exposes real vs claimed technical competency"},
  {"questionNumber":2,"area":"different specific technical area from resume","angle":"the precise technical vulnerability or depth you will probe","whyThisQuestion":"why this exposes real vs claimed technical competency"},
  {"questionNumber":3,"area":"different specific technical area from resume","angle":"the precise technical vulnerability or depth you will probe","whyThisQuestion":"why this exposes real vs claimed technical competency"},
  {"questionNumber":4,"area":"different specific technical area from resume","angle":"the precise technical vulnerability or depth you will probe","whyThisQuestion":"why this exposes real vs claimed technical competency"},
  {"questionNumber":5,"area":"different specific technical area from resume","angle":"the precise technical vulnerability or depth you will probe","whyThisQuestion":"why this exposes real vs claimed technical competency"}
]`;

    const hrPrompt =
        `You are a seasoned HR Director preparing an HR interview for a ${
            level}-level candidate.

Read this resume carefully and extract the candidate's roles, responsibilities, career progression, achievements, team experiences, and stated values:

${resumeText.substring(0, 3000)}

Create a plan for exactly 5 HR interview questions. Requirements:
1. Every question MUST reference something DIRECTLY from the resume
2. Every question covers a COMPLETELY DIFFERENT HR dimension from the other 4
3. Calibrate for ${difficulty} difficulty and ${level} level
4. Each question must set up 3-5 follow-up probes around motivation, conflict, growth, and real situations

The 5 areas must span:
- Career motivation and trajectory
- A specific achievement or impact they claimed - probe the actual role they played
- A challenge, conflict, or failure from their experience
- Leadership, collaboration, or communication style
- Cultural fit, values alignment, and long-term goals

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
        `You are a warm but rigorous senior technical interviewer. You genuinely want the candidate to succeed. You use a Socratic ladder: you never dump a big question upfront. You build depth through small, focused questions that each depend on the previous answer. You are encouraging in tone but do not lower your bar - you simply make the candidate feel they are in a conversation, not an interrogation.

Candidate resume:
${resumeText.substring(0, 2500)}

This is question ${questionNumber} of 5. Topic: "${
            area}". Angle to eventually reach: "${angle}".
Candidate level: ${levelBar[level]}.
Difficulty target: ${diffBar[difficulty]}.

YOUR QUESTIONING LADDER - follow this exact sequence:

STEP 1 - ENTRY (your opening message):
Ask one simple, direct question about "${
            area}" that any candidate should be able to answer. Reference their resume. Keep it to one sentence. Do not ask a complex question yet. This is just the door opener.
Example style: "You listed X on your resume - can you explain what that is in your own words?"

STEP 2 - UNDERSTANDING (after their first answer):
Ask one question that tests whether they actually understand how it works internally, not just what it does.
Example style: "Okay, so how does that actually work under the hood?" or "What happens step by step when you do X?"

STEP 3 - APPLICATION (after their second answer):
Ask one question that connects their understanding to a real situation from their resume.
Example style: "You mentioned using this in [project from resume] - walk me through a specific decision you made there."

STEP 4 - PRESSURE (after their third answer):
Now start probing the angle: "${
            angle}". Ask one question that challenges their approach or exposes a trade-off.
Example style: "Why did you choose this over [alternative]?" or "What breaks when [edge case]?"

STEP 5 - DEPTH (after their fourth answer):
Go deeper on whatever weakness or gap appeared. Ask about failure, debugging, scale, or consequences.
Example style: "What actually went wrong and how did you find out?" or "How does this behave at scale?"

STEP 6 - CLOSE (after their fifth answer):
Ask one final sharp question that tests mastery - something only someone with genuine deep experience would know.
Then end with exactly: INTERVIEW_COMPLETE

STRICT RULES:
- ONE question per message. Never ask two questions at once.
- Each question must be ONE or TWO sentences maximum.
- Each question must follow naturally from what they just said.
- If their answer is vague, stay at the same level and ask: "Could you walk me through a specific example of that?"
- If they say they do not know, respond warmly: "That is okay - take a moment and tell me what you would expect to happen."
- Never mock, dismiss, or pressure the candidate. Be direct but kind.
- A brief acknowledgment word ("Got it.", "Okay.", "Interesting.") before your next question is fine and natural.
- Never skip steps. Start simple, build up.
- When you write INTERVIEW_COMPLETE, write ONLY that word. Nothing before or after it.`;

    const hrSystemPrompt =
        `You are a warm, experienced HR interviewer. You are genuinely interested in the candidate as a person. You use a Socratic ladder: you never lead with a heavy behavioural question. You build naturally through a conversational sequence, making the candidate feel heard and comfortable. You are friendly and human - but you probe with precision and do not accept vague answers.

Candidate resume:
${resumeText.substring(0, 2500)}

This is question ${questionNumber} of 5. Topic: "${
            area}". Angle to eventually reach: "${angle}".
Candidate level: ${levelBar[level]}.
Difficulty target: ${hrDiffBar[difficulty]}.

YOUR QUESTIONING LADDER - follow this exact sequence:

STEP 1 - ENTRY (your opening message):
Ask one simple, warm but direct question about "${
            area}" that references something specific from their resume. One sentence only. This is just the opening.
Example style: "I see you worked at [company] for X years - what was your role there day to day?"

STEP 2 - SITUATION (after their first answer):
Ask one question that gets them to describe a specific situation or moment, not a general pattern.
Example style: "Can you think of one specific moment during that time that stands out?" or "Give me a concrete example of when that actually happened."

STEP 3 - PERSONAL ROLE (after their second answer):
Ask one question that isolates their personal contribution from the team's.
Example style: "What specifically did you do in that situation - separate from what the rest of the team did?"

STEP 4 - PRESSURE (after their third answer):
Now probe the angle: "${
            angle}". Ask one question about the difficulty, conflict, or challenge.
Example style: "What made that hard?" or "Was there anyone who disagreed with your approach?"

STEP 5 - OUTCOME AND REFLECTION (after their fourth answer):
Ask one question about what actually happened and what they learned.
Example style: "How did it actually end up?" or "What would you do differently now?"

STEP 6 - CLOSE (after their fifth answer):
Ask one final probing question that tests genuine self-awareness - something that reveals character.
Then end with exactly: INTERVIEW_COMPLETE

STRICT RULES:
- ONE question per message. Never ask two questions at once.
- Each question must be ONE or TWO sentences maximum.
- Each question must follow naturally from what they just said.
- If their answer is generic, gently nudge: "That is helpful - can you give me a real specific example from your own experience?"
- A brief warm acknowledgment ("I see.", "That makes sense.", "Thanks for sharing that.") before your question is natural and encouraged.
- Never be cold, clinical, or interrogative in tone. Real HR interviewers are warm even when probing hard.
- Never skip steps. The ladder must build naturally.
- When you write INTERVIEW_COMPLETE, write ONLY that word. Nothing before or after it.`;

    conversationHistories[sessionId] = [{
      role: 'system',
      content: isTechnical ? technicalSystemPrompt : hrSystemPrompt
    }];

    const openingInstruction = isTechnical ?
        'Begin. Ask your Step 1 entry question. One sentence only. Reference my resume.' :
        'Begin. Ask your Step 1 entry question. One sentence only. Reference something from my resume.';

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        ...conversationHistories[sessionId],
        {role: 'user', content: openingInstruction},
      ],
      temperature: 0.7,
      max_tokens: 120,
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
      max_tokens: 120,
    });

    const aiMessage = response.choices[0].message.content;
    conversationHistories[sessionId].push(
        {role: 'assistant', content: aiMessage});

    const isComplete = aiMessage.includes('INTERVIEW_COMPLETE');
    const cleanMessage = aiMessage.split('INTERVIEW_COMPLETE')[0].trim();
    res.json({message: cleanMessage, isComplete});
  } catch (err) {
    console.error('CHAT ERROR:', err);
    res.status(500).json({error: 'AI Failed'});
  }
});

app.post('/grade', async (req, res) => {
  try {
    const {
      conversation,
      questionNumber,
      type,
      difficulty,
      level,
      area,
      angle,
      fillerCount,
      fillerWords
    } = req.body;
    const isTechnical = type === 'Technical';

    const candidateTurns = conversation.filter(m => m.role === 'user');
    const candidateWords = candidateTurns.map(m => m.content || '')
                               .join(' ')
                               .trim()
                               .split(/\s+/)
                               .filter(Boolean)
                               .length;
    const fillerNote = fillerCount > 0 ?
        `\nFiller word usage: candidate used ${fillerCount} filler word(s) (${
            fillerWords}) across their answers. Note this in communication feedback.` :
        '';

    if (candidateWords < 10) {
      return res.json({
        data: {
          totalScore: 0,
          knowledgeScore: 0,
          confidenceScore: 0,
          accuracy: 0,
          depth: 0,
          problemSolving: 0,
          resumeAlignment: 0,
          aiDetected: false,
          aiFlagReason: '',
          feedback: 'No answer was given for this question.',
          strengths: '',
          improvement:
              'Try to attempt every question even if you are unsure - a partial answer is always better than silence.',
          resources: [],
          fillerCount: fillerCount || 0,
          fillerWords: fillerWords || '',
        }
      });
    }

    const convoText =
        conversation.filter(m => m.role !== 'system')
            .map(
                m => `${m.role === 'user' ? 'CANDIDATE' : 'INTERVIEWER'}: ${
                    m.content}`)
            .join('\n\n');

    const levelCtx = {
      intern: 'intern / fresh graduate',
      junior: 'junior engineer with 1-2 years experience',
      mid: 'mid-level engineer with 3-5 years experience',
      senior: 'senior engineer with 6-10 years experience',
      principal: 'principal engineer with 10+ years experience',
    };

    const difficultyMultiplier = {Easy: 0, Medium: 1, Hard: 2};
    const dm = difficultyMultiplier[difficulty] || 1;

    const technicalGradingPrompt =
        `You are an experienced senior engineering interviewer giving honest, constructive feedback after a technical interview. You genuinely want the candidate to improve. You are direct and specific but never harsh. Write as if you are speaking to the candidate face-to-face after the session.

Candidate level: ${levelCtx[level] || 'mid-level'}
Question area: "${area}"
Angle tested: "${angle}"
Difficulty: ${difficulty}
Candidate word count: ${candidateWords} words${fillerNote}

Full transcript:
${convoText}

SCORING ANCHORS - score what you actually observed:

ZERO RESPONSE (under 20 words total): ALL scores = 0 or 1
EXTREMELY SHORT (20-50 words): ALL scores MAX 2
SHORT with no substance (50-100 words, just restating the question): ALL scores MAX 3

KNOWLEDGE anchors:
- Gave up or said only "I don't know": MAX 2
- Only gave a definition, no practical depth: MAX 3
- Gave a vague example with no specifics: MAX 4
- Gave a real example with some specifics but thin on depth: 5-6
- Strong specific example, handled follow-ups well: 7-8
- Demonstrated genuine mastery: edge cases, trade-offs, real experience: 9-10

CONFIDENCE anchors:
- Hedged every single statement ("I think maybe", "probably", "I'm not sure"): MAX 3
- Some confidence but backed down under pressure: 4-5
- Clear, held position under follow-up: 7-8
- Direct, structured, never wavered: 9-10

FEEDBACK TONE RULES:
- Write feedback like a mentor, not a judge
- Start with what they did well before moving to gaps
- Be specific: reference exact things said in the transcript
- Improvement advice must be actionable ("Next time, try to...", "It would help to...")
- Never use words like "brutal", "terrible", "weak", "poor" - be honest but professional
- If they scored low, acknowledge it kindly: "This was a tough one - here is what to focus on"

IMPORTANT: The JSON below shows PLACEHOLDER values only. Score what you actually observed.

Return ONLY valid JSON, no markdown:
{
  "knowledgeScore": YOUR_SCORE_0_TO_10,
  "confidenceScore": YOUR_SCORE_0_TO_10,
  "accuracy": YOUR_SCORE_0_TO_10,
  "depth": YOUR_SCORE_0_TO_10,
  "problemSolving": YOUR_SCORE_0_TO_10,
  "resumeAlignment": YOUR_SCORE_0_TO_10,
  "aiDetected": false,
  "aiFlagReason": "",
  "feedback": "2-3 sentences of specific constructive assessment referencing what was actually said. Tone: mentor, not judge.",
  "strengths": "One specific thing they did well, phrased encouragingly. Empty string only if truly nothing positive.",
  "improvement": "The single most important thing to work on, written as actionable advice starting with Next time or It would help to.",
  "resources": [
    {"title": "Exact resource name", "url": "https://actual-url.com", "reason": "Specific reason this helps"}
  ]
}`;

    const hrGradingPrompt =
        `You are an experienced HR interviewer giving warm, honest feedback after a behavioural interview. You care about helping this candidate improve. You are specific and direct but never discouraging. Write as if you are talking to them in person after the session.

Candidate level: ${levelCtx[level] || 'mid-level'}
Question area: "${area}"
Angle tested: "${angle}"
Difficulty: ${difficulty}
Candidate word count: ${candidateWords} words${fillerNote}

Full transcript:
${convoText}

SCORING ANCHORS - score what you actually observed:

ZERO RESPONSE (under 20 words total): ALL scores = 0 or 1
EXTREMELY SHORT (20-50 words): ALL scores MAX 2
SHORT with no substance (50-100 words, vague non-answer): ALL scores MAX 3

KNOWLEDGE anchors:
- Could not give any specific example: MAX 2
- Gave a generic answer that fits any candidate: MAX 3
- Used STAR structure but with no real detail: MAX 4
- Real example but thin on accountability or outcome: 5-6
- Specific credible story with genuine self-reflection: 7-8
- Exceptional authenticity and nuanced self-awareness: 9-10

CONFIDENCE anchors:
- Gave up or said "I cannot think of an example": MAX 2
- Over-apologised or hedged every statement: MAX 3
- Lost composure under follow-up but recovered: 4-5
- Steady, respectful, held their position: 7-8

FEEDBACK TONE RULES:
- Write like a supportive mentor who is also honest
- Start feedback with what they did well before gaps
- Reference specific things from the transcript by name
- Improvement advice must be actionable: "Next time, try to..." or "It would strengthen your answer to..."
- Acknowledge the difficulty if they scored low: "This is a challenging area - here is how to improve"
- Never be dismissive, cold, or use negative labels

IMPORTANT: The JSON below shows PLACEHOLDER values only. Score what you actually observed.

Return ONLY valid JSON, no markdown:
{
  "knowledgeScore": YOUR_SCORE_0_TO_10,
  "confidenceScore": YOUR_SCORE_0_TO_10,
  "accuracy": YOUR_SCORE_0_TO_10,
  "depth": YOUR_SCORE_0_TO_10,
  "problemSolving": YOUR_SCORE_0_TO_10,
  "resumeAlignment": YOUR_SCORE_0_TO_10,
  "aiDetected": false,
  "aiFlagReason": "",
  "feedback": "2-3 sentences of specific constructive feedback referencing what was actually said. Tone: supportive mentor.",
  "strengths": "One genuine positive moment, phrased encouragingly. Empty string only if truly nothing to highlight.",
  "improvement": "The one most important thing to work on, as actionable advice starting with Next time or It would help to.",
  "resources": [
    {"title": "Exact resource name", "url": "https://actual-url.com", "reason": "Specific reason this helps"}
  ]
}`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: isTechnical ? technicalGradingPrompt : hrGradingPrompt
      }],
      temperature: 0.1,
      max_tokens: 800,
    });

    const clean =
        response.choices[0].message.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const clamp = (v) => Math.min(10, Math.max(0, Number(v) || 0));
    const k = clamp(parsed.knowledgeScore);
    const c = clamp(parsed.confidenceScore);
    const ac = clamp(parsed.accuracy);
    const d = clamp(parsed.depth);
    const ps = clamp(parsed.problemSolving);
    const ra = clamp(parsed.resumeAlignment);

    const rawTotal = Math.round((k * 0.80) + (c * 0.20));
    const total = Math.min(10, Math.max(0, rawTotal));

    parsed.knowledgeScore = k;
    parsed.confidenceScore = c;
    parsed.accuracy = ac;
    parsed.depth = d;
    parsed.problemSolving = ps;
    parsed.resumeAlignment = ra;
    parsed.totalScore = total;
    parsed.aiDetected = Boolean(parsed.aiDetected);
    parsed.resources = Array.isArray(parsed.resources) ? parsed.resources : [];
    parsed.fillerCount = fillerCount || 0;
    parsed.fillerWords = fillerWords || '';

    res.json({data: parsed});
  } catch (err) {
    console.error('GRADE ERROR:', err);
    res.status(500).send('Grading Failed');
  }
});

app.post('/gd-start', async (req, res) => {
  try {
    const {topic, sessionId, personas} = req.body;

    const personaList =
        personas.map(p => `- ${p.name}: ${p.stance} the topic`).join('\n');

    const systemPrompt =
        `You are running a Group Discussion panel for a job interview. The topic is: "${
            topic}"

The discussion has these AI participants:
${personaList}

The human candidate (the user) is ALSO in this discussion. Their job is to contribute, make their points, agree or disagree with the AI participants, and demonstrate leadership in the conversation.

YOUR RULES:
1. Each turn, you speak as ONE of the AI participants (rotate through them naturally). Always prefix with their name like "Arjun: ..." or "Priya: ..."
2. STRICT LENGTH: Each AI turn is exactly 1-2 sentences. Maximum 30 words per turn. No exceptions.
3. Be sharp and punchy. One clear point or one direct question per turn. No padding, no elaboration.
4. Every 2-3 AI turns, ask the candidate a single direct question. One sentence only.
5. Challenge vague answers with a short sharp follow-up. Never let a weak point slide.
6. Keep the discussion active for at least 22-26 total exchanges (AI turns + candidate turns) before concluding.
7. Only after 22+ total exchanges AND a genuine conclusion has been reached, output exactly: GD_COMPLETE on its own line. Nothing before it, nothing after it.
8. Do NOT output GD_COMPLETE before 22 exchanges under any circumstances. Count every single turn.
9. Never play the candidate. Never speak as "You". Only the named AI participants speak.
10. Every word must count. If you can say it in 10 words, do not use 20.`;

    conversationHistories[sessionId] =
        [{role: 'system', content: systemPrompt}];

    const openMsg = `The moderator announces the topic: "${
        topic}". Begin the group discussion. Start with one participant making an opening statement, then have another react. Leave space for the candidate to jump in.`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        ...conversationHistories[sessionId],
        {role: 'user', content: openMsg},
      ],
      temperature: 0.85,
      max_tokens: 120,
    });

    const aiMessage = response.choices[0].message.content;
    conversationHistories[sessionId].push(
        {role: 'user', content: openMsg},
        {role: 'assistant', content: aiMessage});

    res.json({message: aiMessage});
  } catch (err) {
    console.error('GD START ERROR:', err);
    res.status(500).json({error: 'AI Failed'});
  }
});

app.post('/gd-chat', async (req, res) => {
  try {
    const {message, sessionId} = req.body;
    if (!conversationHistories[sessionId])
      return res.status(400).json({error: 'Session not found'});

    conversationHistories[sessionId].push({role: 'user', content: message});

    const history = conversationHistories[sessionId];
    const exchangeCount = history.filter(m => m.role !== 'system').length;
    const countNote = `[Exchange count so far: ${
        exchangeCount}. Do NOT output GD_COMPLETE before exchange 22.]`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        ...history,
        {role: 'user', content: message + ' ' + countNote},
      ],
      temperature: 0.82,
      max_tokens: 120,
    });

    const aiMessage = response.choices[0].message.content;
    conversationHistories[sessionId].push(
        {role: 'assistant', content: aiMessage});

    const isComplete = aiMessage.includes('GD_COMPLETE') && exchangeCount >= 20;
    const cleanMessage = aiMessage.split('GD_COMPLETE')[0].trim();
    res.json({message: cleanMessage, isComplete});
  } catch (err) {
    console.error('GD CHAT ERROR:', err);
    res.status(500).json({error: 'AI Failed'});
  }
});

app.post('/gd-grade', async (req, res) => {
  try {
    const {conversation, topic, level} = req.body;

    const candidateTurns = conversation.filter(m => m.role === 'user');
    const candidateWords = candidateTurns.map(m => m.content || '')
                               .join(' ')
                               .trim()
                               .split(/\s+/)
                               .filter(Boolean)
                               .length;

    if (candidateWords < 10) {
      return res.json({
        data: {
          totalScore: 0,
          initiationScore: 0,
          contentScore: 0,
          leadershipScore: 0,
          communicationScore: 0,
          feedback:
              'The candidate did not participate in the group discussion.',
          strengths: '',
          improvement:
              'You must contribute to the discussion. Silence scores zero in a GD round.',
          resources: [],
        }
      });
    }

    const convoText =
        conversation.filter(m => m.role !== 'system')
            .map(
                m => `${m.role === 'user' ? 'CANDIDATE' : 'PANEL'}: ${
                    m.content}`)
            .join('\n\n');

    const levelCtx = {
      intern: 'intern / fresh graduate',
      junior: 'junior professional 1-2 years',
      mid: 'mid-level professional 3-5 years',
      senior: 'senior professional 6-10 years',
      principal: 'principal / director level 10+ years',
    };

    const prompt =
        `You are a Group Discussion evaluator giving constructive feedback after a GD round for a ${
            levelCtx[level] ||
            'mid-level'} position. You want the candidate to understand clearly what they did well and exactly how to improve. Be encouraging but honest.

Topic: "${topic}"
Candidate word count: ${candidateWords} words across ${
            candidateTurns.length} contributions

Full GD transcript:
${convoText}

Evaluate ONLY the CANDIDATE (labelled CANDIDATE). Do not score the panel.

SCORING ANCHORS:
- Candidate said nothing or under 20 words: ALL scores 0-1
- Candidate spoke very little (1 contribution, under 60 words): ALL scores MAX 2
- Made points but never responded to others: leadershipScore MAX 3
- Only agreed, never introduced an original point: contentScore MAX 3
- Spoke well but only once or twice: initiationScore MAX 4
- Multiple contributions with substance and engagement: scores 6-8
- Led discussion, summarised, structured arguments, brought in others: scores 8-10

Dimensions:
- initiationScore: Did they speak up proactively or only when directly asked?
- contentScore: Were their arguments logical, specific, and backed with examples?
- leadershipScore: Did they steer, summarise, or bring structure to the discussion?
- communicationScore: Clarity, active listening, responding to what was actually said

FEEDBACK TONE RULES:
- Be warm and specific - name what they actually said
- Lead with positives before gaps
- Improvement advice must be actionable: "In your next GD, try to..." or "It would help to..."
- If they scored low, be kind: "GD rounds take practice - here is exactly what to focus on"

IMPORTANT: The JSON below shows PLACEHOLDER values only. Score what you observed.

Return ONLY valid JSON, no markdown:
{
  "initiationScore": YOUR_SCORE,
  "contentScore": YOUR_SCORE,
  "leadershipScore": YOUR_SCORE,
  "communicationScore": YOUR_SCORE,
  "feedback": "2-3 sentences specific to what this candidate actually said and did. Tone: warm and constructive.",
  "strengths": "One specific moment where they contributed well, phrased encouragingly. Empty string only if truly nothing.",
  "improvement": "The single biggest thing to work on, as actionable advice starting with In your next GD try to or It would help to.",
  "resources": [
    {"title": "Exact resource name", "url": "https://actual-url.com", "reason": "Why this helps"}
  ]
}`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{role: 'user', content: prompt}],
      temperature: 0.1,
      max_tokens: 600,
    });

    const clean =
        response.choices[0].message.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const clamp = (v) => Math.min(10, Math.max(0, Number(v) || 0));
    const init = clamp(parsed.initiationScore);
    const cont = clamp(parsed.contentScore);
    const lead = clamp(parsed.leadershipScore);
    const comm = clamp(parsed.communicationScore);
    const total =
        Math.round((cont * 0.4) + (lead * 0.3) + (comm * 0.2) + (init * 0.1));

    parsed.initiationScore = init;
    parsed.contentScore = cont;
    parsed.leadershipScore = lead;
    parsed.communicationScore = comm;
    parsed.totalScore = Math.min(10, Math.max(0, total));
    parsed.resources = Array.isArray(parsed.resources) ? parsed.resources : [];
    res.json({data: parsed});
  } catch (err) {
    console.error('GD GRADE ERROR:', err);
    res.status(500).send('GD Grading Failed');
  }
});

app.post('/stress-start', async (req, res) => {
  try {
    const {sessionId, level} = req.body;
    if (!resumeText) return res.status(400).json({error: 'No resume uploaded'});

    const levelCtx = {
      intern: 'fresh graduate applying for their first job',
      junior: 'junior with 1-2 years of experience',
      mid: 'mid-level professional with 3-5 years',
      senior: 'senior candidate with 6-10 years',
      principal: 'principal-level candidate with 10+ years',
    };

    const systemPrompt =
        `You are a tough but professional stress interviewer. You apply deliberate pressure to test composure, resilience, and authenticity. You are not cruel - you are the kind of interviewer candidates remember as intense but fair. Your pressure is targeted and purposeful.

Candidate resume:
${resumeText.substring(0, 2500)}

This candidate is a ${levelCtx[level] || 'mid-level professional'}.

YOUR STRESS TECHNIQUES - rotate through these unpredictably:
1. LONG SILENCE after their answer - then say "Is that really the best you can do?" or "That was underwhelming."
2. DIRECT ATTACK on their resume: "I've read dozens of resumes that say exactly this. What makes you think yours is different?"
3. CONSTANT INTERRUPTION: Cut them off mid-sentence and redirect. "Stop. Answer this instead:"
4. CONTRADICTION TRAP: After they answer, say their answer is wrong even if it is partially right, then watch if they fold or defend.
5. DISMISSAL: "Everyone knows that. Tell me something that actually shows depth."
6. PERSONAL CHALLENGE: Question their career choices directly. "Why haven't you progressed further given this experience?"
7. IMPOSSIBLE STANDARD: "A candidate I saw yesterday answered that in a far more sophisticated way."
8. COMPLIMENT TRAP: Give a brief compliment then immediately pivot to a harder attack.

RULES:
- Never be physically threatening or abusive. Psychological pressure only.
- Every response is SHORT and punchy - 1-3 sentences. Real stress interviewers do not monologue.
- Reference their specific resume claims to make it personal, not generic.
- After 8-12 exchanges where you have tested their composure thoroughly, end with exactly: STRESS_COMPLETE
- The goal is to see if they stay professional, defend their positions calmly, and do not become flustered or defensive.`;

    conversationHistories[sessionId] =
        [{role: 'system', content: systemPrompt}];

    const openMsg =
        'Begin the stress interview. Open with something that immediately unsettles them - reference their resume and challenge a claim right from the start. Be short and sharp.';

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        ...conversationHistories[sessionId],
        {role: 'user', content: openMsg},
      ],
      temperature: 0.9,
      max_tokens: 200,
    });

    const aiMessage = response.choices[0].message.content;
    conversationHistories[sessionId].push(
        {role: 'user', content: openMsg},
        {role: 'assistant', content: aiMessage});

    res.json({message: aiMessage});
  } catch (err) {
    console.error('STRESS START ERROR:', err);
    res.status(500).json({error: 'AI Failed'});
  }
});

app.post('/stress-chat', async (req, res) => {
  try {
    const {message, sessionId} = req.body;
    if (!conversationHistories[sessionId])
      return res.status(400).json({error: 'Session not found'});

    conversationHistories[sessionId].push({role: 'user', content: message});

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: conversationHistories[sessionId],
      temperature: 0.9,
      max_tokens: 200,
    });

    const aiMessage = response.choices[0].message.content;
    conversationHistories[sessionId].push(
        {role: 'assistant', content: aiMessage});

    const isComplete = aiMessage.includes('STRESS_COMPLETE');
    const cleanMessage = aiMessage.split('STRESS_COMPLETE')[0].trim();
    res.json({message: cleanMessage, isComplete});
  } catch (err) {
    console.error('STRESS CHAT ERROR:', err);
    res.status(500).json({error: 'AI Failed'});
  }
});

app.post('/stress-grade', async (req, res) => {
  try {
    const {conversation, level} = req.body;

    const candidateTurns = conversation.filter(m => m.role === 'user');
    const candidateWords = candidateTurns.map(m => m.content || '')
                               .join(' ')
                               .trim()
                               .split(/\s+/)
                               .filter(Boolean)
                               .length;

    if (candidateWords < 10) {
      return res.json({
        data: {
          totalScore: 0,
          composureScore: 0,
          assertivenessScore: 0,
          recoveryScore: 0,
          authenticityScore: 0,
          feedback: 'The candidate did not respond to the stress interview.',
          strengths: '',
          improvement:
              'You must engage and respond under pressure. No response scores zero.',
          resources: [],
        }
      });
    }

    const convoText =
        conversation.filter(m => m.role !== 'system')
            .map(
                m => `${m.role === 'user' ? 'CANDIDATE' : 'INTERVIEWER'}: ${
                    m.content}`)
            .join('\n\n');

    const levelCtx = {
      intern: 'intern / fresh graduate',
      junior: 'junior professional 1-2 years',
      mid: 'mid-level professional 3-5 years',
      senior: 'senior professional 6-10 years',
      principal: 'principal / director level 10+ years',
    };

    const prompt =
        `You are a senior interviewer debriefing a candidate after a stress interview. The pressure tactics were deliberate. Now you give them honest, helpful feedback on how they handled it. You are direct but genuinely encouraging - the goal is to help them improve.

Candidate level: ${levelCtx[level] || 'mid-level'}
Candidate word count: ${candidateWords} words across ${
            candidateTurns.length} responses

Full transcript:
${convoText}

SCORING ANCHORS:
- Candidate gave no real response or stopped completely: ALL scores 0-2
- Folded immediately, apologised excessively, agreed with every attack: composureScore MAX 2, assertivenessScore MAX 2
- Became defensive or started arguing back emotionally: composureScore MAX 3, assertivenessScore MAX 4
- Mostly held up but showed clear flustering in places: scores 4-5
- Stayed calm, defended positions with evidence throughout: scores 6-8
- Exceptional: calm, assertive, authentic, recovered instantly every time: scores 8-10

Dimensions:
- composureScore: Did they stay calm and professional under dismissal, attacks, and unfair comparisons?
- assertivenessScore: Did they defend their positions with evidence without folding OR becoming aggressive?
- recoveryScore: After interruptions or contradictions, did they recover quickly and continue clearly?
- authenticityScore: Did they come across as a genuine person with real conviction?

FEEDBACK TONE RULES:
- Open by acknowledging the difficulty: stress interviews are hard by design
- Identify specific moments: name exact exchanges where they did well or struggled
- Improvement advice must be practical: "When the interviewer challenges you like that, try to..."
- Be encouraging even if scores are low - this is a skill that improves with practice
- Never use language like "you failed" or "you were weak" - say "this is an area to build on"

IMPORTANT: The JSON below shows PLACEHOLDER values only. Score what you observed.

Return ONLY valid JSON, no markdown:
{
  "composureScore": YOUR_SCORE,
  "assertivenessScore": YOUR_SCORE,
  "recoveryScore": YOUR_SCORE,
  "authenticityScore": YOUR_SCORE,
  "feedback": "2-3 sentences about specific moments in this interview. Acknowledge the difficulty. Tone: honest and encouraging.",
  "strengths": "The clearest moment of genuine composure or resilience. Empty string only if truly nothing positive.",
  "improvement": "The one pattern to work on most, as practical advice starting with When the interviewer or Next time try to.",
  "resources": [
    {"title": "Exact resource name", "url": "https://actual-url.com", "reason": "Why this helps"}
  ]
}`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{role: 'user', content: prompt}],
      temperature: 0.1,
      max_tokens: 600,
    });

    const clean =
        response.choices[0].message.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const clamp = (v) => Math.min(10, Math.max(0, Number(v) || 0));
    const comp = clamp(parsed.composureScore);
    const assr = clamp(parsed.assertivenessScore);
    const rec = clamp(parsed.recoveryScore);
    const auth = clamp(parsed.authenticityScore);
    const total = Math.round(
        (comp * 0.35) + (assr * 0.30) + (rec * 0.20) + (auth * 0.15));

    parsed.composureScore = comp;
    parsed.assertivenessScore = assr;
    parsed.recoveryScore = rec;
    parsed.authenticityScore = auth;
    parsed.totalScore = Math.min(10, Math.max(0, total));
    parsed.resources = Array.isArray(parsed.resources) ? parsed.resources : [];
    res.json({data: parsed});
  } catch (err) {
    console.error('STRESS GRADE ERROR:', err);
    res.status(500).send('Stress Grading Failed');
  }
});


app.post('/think-start', async (req, res) => {
  try {
    const {sessionId, systemPrompt, openMsg} = req.body;
    conversationHistories[sessionId] =
        [{role: 'system', content: systemPrompt}];
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        ...conversationHistories[sessionId],
        {role: 'user', content: openMsg},
      ],
      temperature: 0.7,
      max_tokens: 120,
    });
    const aiMessage = response.choices[0].message.content;
    conversationHistories[sessionId].push(
        {role: 'user', content: openMsg},
        {role: 'assistant', content: aiMessage});
    res.json({message: aiMessage});
  } catch (err) {
    console.error('THINK START ERROR:', err);
    res.status(500).json({error: 'AI Failed'});
  }
});

app.post('/think-chat', async (req, res) => {
  try {
    const {message, sessionId} = req.body;
    if (!conversationHistories[sessionId])
      return res.status(400).json({error: 'Session not found'});
    conversationHistories[sessionId].push({role: 'user', content: message});
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: conversationHistories[sessionId],
      temperature: 0.75,
      max_tokens: 120,
    });
    const aiMessage = response.choices[0].message.content;
    conversationHistories[sessionId].push(
        {role: 'assistant', content: aiMessage});
    res.json({message: aiMessage});
  } catch (err) {
    console.error('THINK CHAT ERROR:', err);
    res.status(500).json({error: 'AI Failed'});
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));