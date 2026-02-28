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

app.post('/upload-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const result = await mammoth.extractRawText({buffer: req.file.buffer});
    resumeText = result.value;
    if (!resumeText || resumeText.trim().length < 10) {
      resumeText = '';
      return res.json({message: 'Success', hasText: false});
    }
    res.json({message: 'Success', hasText: true});
  } catch (error) {
    resumeText = '';
    res.json({message: 'Success', hasText: false});
  }
});

app.get('/ask', async (req, res) => {
  try {
    const {questionNumber, type, difficulty} = req.query;
    let typePrompt = type === 'Technical' ? 'technical/coding' :
        type === 'HR'                     ? 'HR/culture fit/background' :
                                            'behavioral (STAR method)';
    let diffPrompt = difficulty === 'Easy' ? 'simple and beginner-friendly' :
        difficulty === 'Medium'            ? 'moderately challenging' :
                                             'advanced and challenging';
    let prompt = `Ask a single unique ${
        typePrompt} interview question that is ${
        diffPrompt}. This is question number ${
        questionNumber} out of 10, make it completely different from previous ones. Just the question, nothing else.`;
    if (resumeText) {
      prompt = `Based on this resume: ${
          resumeText.substring(
              0,
              2000)}, ask one unique ${typePrompt} interview question that is ${
          diffPrompt}. This is question number ${
          questionNumber} out of 10, make it completely different. Just the question, nothing else.`;
    }
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{role: 'user', content: prompt}],
    });
    res.json({question: response.choices[0].message.content});
  } catch (error) {
    res.status(500).json({error: 'AI Failed'});
  }
});

app.post('/grade', async (req, res) => {
  try {
    const {question, answer, type, difficulty, confidence} = req.body;
    const prompt = `You are an expert interviewer. Grade this ${
        type} interview answer at ${
        difficulty} difficulty. Candidate confidence: ${confidence}/5.

Q: ${question}
A: ${answer}

Check if this answer looks AI-generated (overly formal, perfectly structured, uses "In conclusion", "It is worth noting", "Furthermore", too perfectly balanced).

Return ONLY this exact JSON, no markdown, no extra text:
{"totalScore":7,"accuracy":8,"communication":7,"depth":6,"aiDetected":false,"aiFlagReason":"","feedback":"Detailed feedback here.","improvement":"One specific tip here.","resources":[{"title":"Resource name","url":"https://example.com","reason":"Why this helps"}]}

Rules:
- All scores must be integers 1-10
- aiDetected must be true or false
- resources must be 2-3 real websites like MDN, freeCodeCamp, GeeksforGeeks, LeetCode`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{role: 'user', content: prompt}],
    });

    const cleanJson =
        response.choices[0].message.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    parsed.totalScore = Number(parsed.totalScore) || 0;
    parsed.accuracy = Number(parsed.accuracy) || 0;
    parsed.communication = Number(parsed.communication) || 0;
    parsed.depth = Number(parsed.depth) || 0;
    parsed.aiDetected = Boolean(parsed.aiDetected);
    parsed.resources = parsed.resources || [];
    res.json({data: parsed});
  } catch (error) {
    console.error('GRADE ERROR:', error);
    res.status(500).send('Grading Failed');
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));