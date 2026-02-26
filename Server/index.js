const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const pdfParse = require('pdf-parse');  // The library causing the TypeError
const {GoogleGenerativeAI} = require('@google/generative-ai');

dotenv.config();
const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());

// PING tracker to see if the frontend is actually hitting the server
app.use((req, res, next) => {
  console.log(`[PING] Frontend reached: ${req.method} ${req.url}`);
  next();
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
let resumeText = '';

// FIXED PDF ROUTE
app.post('/upload-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded.');

    // Safety Check: Handles cases where the function is nested in the import
    const parseFunction =
        typeof pdfParse === 'function' ? pdfParse : pdfParse.default;
    const data = await parseFunction(req.file.buffer);

    resumeText = data.text;
    console.log('=> PDF Parsed Successfully! Text length:', resumeText.length);
    res.json({message: 'Success'});
  } catch (error) {
    console.error('PDF Parsing Error:', error.message);
    res.status(500).send('Parsing Failed: ' + error.message);
  }
});

// AI Question Route (Using your verified Gemini 2.5 Flash)
app.get('/ask', async (req, res) => {
  try {
    const model = genAI.getGenerativeModel({model: 'gemini-2.5-flash'});
    let prompt = 'Ask a generic technical web dev question.';
    if (resumeText) {
      prompt = `Based on this resume: ${
          resumeText.substring(
              0, 2000)}, ask one tailored technical interview question.`;
    }

    const result = await model.generateContent(prompt);
    console.log('=> Gemini responded successfully!');
    res.json({question: result.response.text()});
  } catch (error) {
    console.error('Gemini Error:', error);
    res.status(500).json({error: 'AI Failed'});
  }
});

// AI Grading Route
app.post('/grade', async (req, res) => {
  try {
    const {question, answer} = req.body;
    const model = genAI.getGenerativeModel({model: 'gemini-2.5-flash'});
    const prompt = `Q: ${question}\nA: ${
        answer}\nReturn JSON: {"score": 1-10, "feedback": "text"}`;
    const result = await model.generateContent(prompt);
    const cleanJson = result.response.text().replace(/```json|```/g, '').trim();
    res.json({data: JSON.parse(cleanJson)});
  } catch (error) {
    res.status(500).send('Grading Failed');
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));