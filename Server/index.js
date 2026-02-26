const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Groq = require('groq-sdk');

dotenv.config();
const app = express();
const upload = multer();
const groq = new Groq({apiKey: process.env.GROQ_API_KEY});

app.use(cors());
app.use(express.json());

let resumeText = '';

app.post('/upload-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const parseFunction =
        typeof pdfParse === 'function' ? pdfParse : pdfParse.default;
    const data = await parseFunction(req.file.buffer);
    resumeText = data.text;
    res.json({message: 'Success'});
  } catch (error) {
    res.status(500).send('Parsing Failed: ' + error.message);
  }
});

app.get('/ask', async (req, res) => {
  try {
    let prompt =
        'Ask a single generic technical web dev interview question. Just the question, nothing else.';
    if (resumeText) {
      prompt = `Based on this resume: ${
          resumeText.substring(
              0,
              2000)}, ask one tailored technical interview question. Just the question, nothing else.`;
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
    const {question, answer} = req.body;
    const prompt = `Q: ${question}\nA: ${
        answer}\nReturn only valid JSON with no extra text: {"score": <number from 1-10>, "feedback": "<feedback text>"}`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{role: 'user', content: prompt}],
    });

    const cleanJson =
        response.choices[0].message.content.replace(/```json|```/g, '').trim();
    res.json({data: JSON.parse(cleanJson)});
  } catch (error) {
    res.status(500).send('Grading Failed');
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));