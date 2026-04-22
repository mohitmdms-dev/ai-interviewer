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
const histories = {};

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  Object.keys(histories).forEach(k => {
    if (histories[k].ts < cutoff) delete histories[k];
  });
}, 30 * 60 * 1000);

const MODEL = 'llama-3.3-70b-versatile';
const clamp = v => Math.min(10, Math.max(0, Number(v) || 0));
const getAI = (msgs, temp = 0.7, tokens = 120) => groq.chat.completions.create(
    {model: MODEL, messages: msgs, temperature: temp, max_tokens: tokens});
const parseAI = text => JSON.parse(text.replace(/```json|```/g, '').trim());
const transcript = (conv, roles = {
  user: 'CANDIDATE',
  assistant: 'INTERVIEWER'
}) => conv.filter(m => m.role !== 'system')
          .map(m => `${roles[m.role] || m.role}: ${m.content}`)
          .join('\n\n');

const LEVEL_CTX = {
  intern: 'intern / fresh graduate',
  junior: 'junior 1-2 years',
  mid: 'mid-level 3-5 years',
  senior: 'senior 6-10 years',
  principal: 'principal 10+ years',
};

const LEVEL_BAR = {
  intern: 'an intern - fundamentals must be precise; bluffing is penalised',
  junior:
      'a junior with 1-2 years - real hands-on knowledge, not just definitions',
  mid: 'a mid-level with 3-5 years - vague answers are a red flag',
  senior:
      'a senior with 6-10 years - deep expertise, trade-offs, real war stories',
  principal: 'a principal 10+ years - anything below mastery is unacceptable',
};

const DIFF_BAR = {
  Easy: 'precise foundational understanding',
  Medium: 'technically demanding with real-world examples and depth',
  Hard: 'mastery-level: edge cases, failure modes, architectural reasoning',
};

const HR_DIFF_BAR = {
  Easy: 'clear honest self-reflection with concrete examples',
  Medium: 'nuanced examples with measurable impact and self-awareness',
  Hard:
      'deep introspection, complex conflict resolution, demonstrated leadership',
};

function startSession(sessionId, systemPrompt) {
  histories[sessionId] = {
    ts: Date.now(),
    msgs: [{role: 'system', content: systemPrompt}]
  };
}

function getHistory(sessionId) {
  return histories[sessionId]?.msgs;
}

function pushHistory(sessionId, ...msgs) {
  histories[sessionId].msgs.push(...msgs);
}

async function chat(sessionId, userMsg, temp, tokens) {
  const msgs = getHistory(sessionId);
  msgs.push({role: 'user', content: userMsg});
  const r = await getAI(msgs, temp, tokens);
  const ai = r.choices[0].message.content;
  msgs.push({role: 'assistant', content: ai});
  return ai;
}

app.post('/upload-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const result = await mammoth.extractRawText({buffer: req.file.buffer});
    resumeText = result.value.trim();
    res.json({hasText: resumeText.length >= 20});
  } catch {
    resumeText = '';
    res.json({hasText: false});
  }
});

app.post('/analyse-resume', async (req, res) => {
  try {
    if (!resumeText) return res.status(400).json({error: 'No resume uploaded'});
    const {type, difficulty, level} = req.body;
    const isTech = type === 'Technical';

    const prompt = isTech ?
        `You are a senior technical interviewer preparing 5 questions for a ${
            level}-level candidate.
Resume: ${resumeText.substring(0, 3000)}
Calibrate for ${
            difficulty} difficulty. Each question must reference the resume directly and cover a different technical dimension.
Return ONLY JSON array: [{"questionNumber":1,"area":"...","angle":"...","whyThisQuestion":"..."},...]` :
        `You are an HR Director preparing 5 behavioural questions for a ${
            level}-level candidate.
Resume: ${resumeText.substring(0, 3000)}
Calibrate for ${
            difficulty} difficulty. Span: motivation, achievement, challenge, leadership, values.
Return ONLY JSON array: [{"questionNumber":1,"area":"...","angle":"...","whyThisQuestion":"..."},...]`;

    const r = await getAI([{role: 'user', content: prompt}], 0.6, 900);
    const plans = parseAI(r.choices[0].message.content);
    res.json({plans});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: 'Analysis failed'});
  }
});

app.post('/start-question', async (req, res) => {
  try {
    const {questionNumber, type, difficulty, level, sessionId, area, angle} =
        req.body;
    const isTech = type === 'Technical';
    const diffBar = isTech ? DIFF_BAR[difficulty] : HR_DIFF_BAR[difficulty];

    const ladder = isTech ?
        `STEP 1 ENTRY: One simple question referencing "${
            area}" from their resume.
STEP 2 UNDERSTANDING: How does it work internally?
STEP 3 APPLICATION: Connect to a real project from their resume.
STEP 4 PRESSURE: Probe "${
            angle}" - challenge their approach or expose a trade-off.
STEP 5 DEPTH: Failure, debugging, scale, or consequences.
STEP 6 CLOSE: Mastery-level question. Then output exactly: INTERVIEW_COMPLETE` :
        `STEP 1 ENTRY: Warm opening about "${area}" referencing their resume.
STEP 2 SITUATION: Ask for a specific moment or example.
STEP 3 PERSONAL ROLE: Isolate their personal contribution from the team.
STEP 4 PRESSURE: Probe "${angle}" - difficulty, conflict, or challenge.
STEP 5 OUTCOME: What happened and what did they learn?
STEP 6 CLOSE: Self-awareness question. Then output exactly: INTERVIEW_COMPLETE`;

    const tone = isTech ?
        'warm but rigorous senior technical interviewer. Encouraging tone, high bar.' :
        'warm experienced HR interviewer. Genuinely interested, friendly but precise.';

    const sys = `You are a ${tone}
Resume: ${resumeText.substring(0, 2500)}
Question ${questionNumber}/5. Topic: "${area}". Angle: "${angle}".
Level: ${LEVEL_BAR[level]}. Difficulty: ${diffBar}.
${ladder}
RULES: ONE question per message. 1-2 sentences max. Follow naturally from their answer.
If vague: ask for a specific example. If stuck: "Take a moment - what would you expect?"
Brief acknowledgment ("Got it.", "Interesting.") before questions is natural.
INTERVIEW_COMPLETE = that word only, nothing else.`;

    startSession(sessionId, sys);
    const opening = `Begin. Ask Step 1. One sentence. Reference my resume.`;
    const ai = await chat(sessionId, opening, 0.7, 120);
    res.json({message: ai});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: 'AI Failed'});
  }
});

app.post('/chat', async (req, res) => {
  try {
    const {message, sessionId} = req.body;
    if (!getHistory(sessionId))
      return res.status(400).json({error: 'Session not found'});
    const ai = await chat(sessionId, message, 0.7, 120);
    const isComplete = ai.includes('INTERVIEW_COMPLETE');
    res.json({message: ai.split('INTERVIEW_COMPLETE')[0].trim(), isComplete});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: 'AI Failed'});
  }
});

app.post('/grade', async (req, res) => {
  try {
    const {
      conversation,
      type,
      difficulty,
      level,
      area,
      angle,
      fillerCount,
      fillerWords
    } = req.body;
    const isTech = type === 'Technical';
    const turns = conversation.filter(m => m.role === 'user');
    const wordCount = turns.map(m => m.content || '')
                          .join(' ')
                          .trim()
                          .split(/\s+/)
                          .filter(Boolean)
                          .length;

    if (wordCount < 10) {
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
          feedback: 'No answer given.',
          strengths: '',
          improvement:
              'Attempt every question - a partial answer is better than silence.',
          resources: [],
          fillerCount: fillerCount || 0,
          fillerWords: fillerWords || '',
        }
      });
    }

    const fillerNote = fillerCount > 0 ?
        `\nFiller words: ${fillerCount} detected (${fillerWords}).` :
        '';

    const scoreAnchors = isTech ?
        `KNOWLEDGE: "I don't know"=MAX2, definition only=MAX3, vague example=MAX4, real example=5-6, strong+followup=7-8, mastery=9-10
CONFIDENCE: hedged everything=MAX3, backed down=4-5, held position=7-8, structured/direct=9-10` :
        `KNOWLEDGE: no example=MAX2, generic=MAX3, STAR no detail=MAX4, real+thin=5-6, credible+reflection=7-8, exceptional=9-10
CONFIDENCE: gave up=MAX2, over-apologised=MAX3, lost composure=4-5, steady+respectful=7-8`;

    const jsonShape = isTech ?
        `{"knowledgeScore":S,"confidenceScore":S,"accuracy":S,"depth":S,"problemSolving":S,"resumeAlignment":S,"aiDetected":false,"aiFlagReason":"","feedback":"...","strengths":"...","improvement":"...","resources":[{"title":"...","url":"...","reason":"..."}]}` :
        `{"knowledgeScore":S,"confidenceScore":S,"accuracy":S,"depth":S,"problemSolving":S,"resumeAlignment":S,"aiDetected":false,"aiFlagReason":"","feedback":"...","strengths":"...","improvement":"...","resources":[{"title":"...","url":"...","reason":"..."}]}`;

    const roleLabel = isTech ? 'senior engineering interviewer' :
                               'experienced HR interviewer';

    const prompt = `You are a ${
        roleLabel} giving constructive post-interview feedback. Be a mentor, not a judge.
Level: ${LEVEL_CTX[level] || 'mid-level'} | Area: "${area}" | Angle: "${
        angle}" | Difficulty: ${difficulty}
Words: ${wordCount}${fillerNote}

Transcript:
${transcript(conversation)}

SCORING (0-10, score what you observed):
${scoreAnchors}
SHORT responses (under 50 words total): ALL scores MAX 2

FEEDBACK RULES: Start with strengths. Be specific. Improvement = "Next time..." or "It would help to...". Never harsh.
Return ONLY valid JSON (replace S with scores): ${jsonShape}`;

    const r = await getAI([{role: 'user', content: prompt}], 0.1, 800);
    const parsed = parseAI(r.choices[0].message.content);

    const k = clamp(parsed.knowledgeScore);
    const c = clamp(parsed.confidenceScore);
    Object.assign(parsed, {
      knowledgeScore: k,
      confidenceScore: c,
      accuracy: clamp(parsed.accuracy),
      depth: clamp(parsed.depth),
      problemSolving: clamp(parsed.problemSolving),
      resumeAlignment: clamp(parsed.resumeAlignment),
      totalScore: clamp(Math.round(k * 0.8 + c * 0.2)),
      aiDetected: Boolean(parsed.aiDetected),
      resources: Array.isArray(parsed.resources) ? parsed.resources : [],
      fillerCount: fillerCount || 0,
      fillerWords: fillerWords || '',
    });
    res.json({data: parsed});
  } catch (err) {
    console.error(err);
    res.status(500).send('Grading Failed');
  }
});

app.post('/gd-start', async (req, res) => {
  try {
    const {topic, sessionId, personas} = req.body;
    const list =
        personas.map(p => `- ${p.name}: ${p.stance} the topic`).join('\n');

    const sys =
        `You are running a Group Discussion for a job interview. Topic: "${
            topic}"
Participants:\n${list}
RULES:
1. Each turn speak as ONE participant. Always prefix: "Name: ..."
2. STRICT: 1-2 sentences per turn, max 30 words. Sharp and punchy.
3. Every 2-3 turns ask the candidate a direct question.
4. Keep discussion going for 22+ total exchanges before concluding.
5. Only after 22+ exchanges output exactly: GD_COMPLETE on its own line.
6. Never speak as the candidate. Only named AI participants.`;

    startSession(sessionId, sys);
    const openMsg = `Announce topic "${
        topic}". Two participants make opening statements. Leave space for candidate.`;
    const ai = await chat(sessionId, openMsg, 0.85, 120);
    res.json({message: ai});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: 'AI Failed'});
  }
});

app.post('/gd-chat', async (req, res) => {
  try {
    const {message, sessionId} = req.body;
    if (!getHistory(sessionId))
      return res.status(400).json({error: 'Session not found'});

    const exchangeCount =
        getHistory(sessionId).filter(m => m.role !== 'system').length;
    const countNote =
        `[Exchange ${exchangeCount}. No GD_COMPLETE before exchange 22.]`;
    const ai = await chat(sessionId, message + ' ' + countNote, 0.82, 120);
    const isComplete = ai.includes('GD_COMPLETE') && exchangeCount >= 20;
    res.json({message: ai.split('GD_COMPLETE')[0].trim(), isComplete});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: 'AI Failed'});
  }
});

app.post('/gd-grade', async (req, res) => {
  try {
    const {conversation, topic, level} = req.body;
    const turns = conversation.filter(m => m.role === 'user');
    const wordCount = turns.map(m => m.content || '')
                          .join(' ')
                          .split(/\s+/)
                          .filter(Boolean)
                          .length;

    if (wordCount < 10) {
      return res.json({
        data: {
          totalScore: 0,
          initiationScore: 0,
          contentScore: 0,
          leadershipScore: 0,
          communicationScore: 0,
          feedback: 'Candidate did not participate.',
          strengths: '',
          improvement: 'You must contribute. Silence scores zero in GD.',
          resources: [],
        }
      });
    }

    const prompt = `You are a GD evaluator giving constructive feedback for a ${
        LEVEL_CTX[level] || 'mid-level'} candidate.
Topic: "${topic}" | Words: ${wordCount} across ${turns.length} contributions
Transcript:\n${transcript(conversation, {
      user: 'CANDIDATE',
      assistant: 'PANEL'
    })}

Score ONLY the CANDIDATE. Anchors:
- Nothing / under 20 words: ALL 0-1
- 1 contribution under 60 words: ALL MAX 2
- Points but no response to others: leadershipScore MAX 3
- Only agreed, no original point: contentScore MAX 3
- Multiple contributions with engagement: 6-8
- Led, summarised, structured: 8-10

Dimensions: initiationScore, contentScore, leadershipScore, communicationScore
Feedback: warm, specific, actionable. Lead with positives.
Return ONLY valid JSON: {"initiationScore":S,"contentScore":S,"leadershipScore":S,"communicationScore":S,"feedback":"...","strengths":"...","improvement":"...","resources":[]}`;

    const r = await getAI([{role: 'user', content: prompt}], 0.1, 600);
    const parsed = parseAI(r.choices[0].message.content);
    const init = clamp(parsed.initiationScore);
    const cont = clamp(parsed.contentScore);
    const lead = clamp(parsed.leadershipScore);
    const comm = clamp(parsed.communicationScore);
    Object.assign(parsed, {
      initiationScore: init,
      contentScore: cont,
      leadershipScore: lead,
      communicationScore: comm,
      totalScore:
          clamp(Math.round(cont * 0.4 + lead * 0.3 + comm * 0.2 + init * 0.1)),
      resources: Array.isArray(parsed.resources) ? parsed.resources : [],
    });
    res.json({data: parsed});
  } catch (err) {
    console.error(err);
    res.status(500).send('GD Grading Failed');
  }
});

app.post('/stress-start', async (req, res) => {
  try {
    const {sessionId, level} = req.body;
    if (!resumeText) return res.status(400).json({error: 'No resume uploaded'});

    const sys =
        `You are a tough but fair stress interviewer. Deliberate pressure: composure, resilience, authenticity.
Resume: ${resumeText.substring(0, 2500)}
Candidate: ${LEVEL_CTX[level] || 'mid-level'}.
TECHNIQUES (rotate unpredictably): silence then "Is that your best?", direct resume attack, interruption redirect, contradiction trap, dismissal, career challenge, impossible standard, compliment-then-attack.
RULES: 1-3 sentences per response. Reference their resume. After 8-12 exchanges end with: STRESS_COMPLETE`;

    startSession(sessionId, sys);
    const ai = await chat(
        sessionId,
        'Begin. Challenge a resume claim immediately. Short and sharp.', 0.9,
        200);
    res.json({message: ai});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: 'AI Failed'});
  }
});

app.post('/stress-chat', async (req, res) => {
  try {
    const {message, sessionId} = req.body;
    if (!getHistory(sessionId))
      return res.status(400).json({error: 'Session not found'});
    const ai = await chat(sessionId, message, 0.9, 200);
    const isComplete = ai.includes('STRESS_COMPLETE');
    res.json({message: ai.split('STRESS_COMPLETE')[0].trim(), isComplete});
  } catch (err) {
    console.error(err);
    res.status(500).json({error: 'AI Failed'});
  }
});

app.post('/stress-grade', async (req, res) => {
  try {
    const {conversation, level} = req.body;
    const turns = conversation.filter(m => m.role === 'user');
    const wordCount = turns.map(m => m.content || '')
                          .join(' ')
                          .split(/\s+/)
                          .filter(Boolean)
                          .length;

    if (wordCount < 10) {
      return res.json({
        data: {
          totalScore: 0,
          composureScore: 0,
          assertivenessScore: 0,
          recoveryScore: 0,
          authenticityScore: 0,
          feedback: 'Candidate did not respond.',
          strengths: '',
          improvement: 'Engage and respond under pressure. No response = zero.',
          resources: [],
        }
      });
    }

    const prompt =
        `You are debriefing a candidate after a deliberate stress interview. Honest and encouraging.
Level: ${LEVEL_CTX[level] || 'mid-level'} | Words: ${wordCount} across ${
            turns.length} responses
Transcript:\n${transcript(conversation)}

Anchors: gave up=ALL 0-2, folded/excessive apology=composure MAX2 assert MAX2, defensive/argumentative=composure MAX3 assert MAX4, mostly held up=4-5, calm+defended=6-8, exceptional=8-10
Dimensions: composureScore, assertivenessScore, recoveryScore, authenticityScore
Open by acknowledging difficulty. Be encouraging. Improvement = "When challenged like that, try to..."
Return ONLY valid JSON: {"composureScore":S,"assertivenessScore":S,"recoveryScore":S,"authenticityScore":S,"feedback":"...","strengths":"...","improvement":"...","resources":[]}`;

    const r = await getAI([{role: 'user', content: prompt}], 0.1, 600);
    const parsed = parseAI(r.choices[0].message.content);
    const comp = clamp(parsed.composureScore);
    const assr = clamp(parsed.assertivenessScore);
    const rec = clamp(parsed.recoveryScore);
    const auth = clamp(parsed.authenticityScore);
    Object.assign(parsed, {
      composureScore: comp,
      assertivenessScore: assr,
      recoveryScore: rec,
      authenticityScore: auth,
      totalScore: clamp(
          Math.round(comp * 0.35 + assr * 0.30 + rec * 0.20 + auth * 0.15)),
      resources: Array.isArray(parsed.resources) ? parsed.resources : [],
    });
    res.json({data: parsed});
  } catch (err) {
    console.error(err);
    res.status(500).send('Stress Grading Failed');
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));