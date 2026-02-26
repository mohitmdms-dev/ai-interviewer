import './App.css';

import axios from 'axios';
import {jsPDF} from 'jspdf';
import React, {useState} from 'react';

function App() {
  const [question, setQuestion] = useState('Upload Resume to Start');
  const [answer, setAnswer] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [interviewStep, setInterviewStep] = useState(0);
  const [scores, setScores] = useState([]);
  const [isFinished, setIsFinished] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState(null);

  const handleFileUpload = async (e) => {
    const formData = new FormData();
    formData.append('resume', e.target.files[0]);
    try {
      await axios.post('http://localhost:5000/upload-resume', formData);
      alert('Resume Uploaded!');
    } catch (err) {
      alert('Check Server Terminal for PDF Error.');
    }
  };

  const fetchNextQuestion = async () => {
    setAnswer('');
    setCurrentFeedback(null);
    try {
      const res = await axios.get('http://localhost:5000/ask');
      setQuestion(res.data.question);
    } catch (err) {
      setQuestion('Error connecting to AI.');
    }
  };

  const submitAndNext = async () => {
    try {
      const res =
          await axios.post('http://localhost:5000/grade', {question, answer});
      setScores([...scores, res.data.data.score]);
      setCurrentFeedback(res.data.data);
    } catch (err) {
      alert('Grading failed.');
    }
  };

  const finishStep = () => {
    if (interviewStep < 5) {
      setInterviewStep(interviewStep + 1);
      fetchNextQuestion();
    } else {
      setIsFinished(true);
    }
  };

  const startListening = () => {
    const Speech = window.SpeechRecognition || window.webkitRecognition;
    const rec = new Speech();
    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onresult = (e) => setAnswer(e.results[0][0].transcript);
    rec.start();
  };

  if (isFinished) {
    return (
      <div className='app-container'>
        <div className='dashboard-card'>
          <h1>Interview Complete!</h1>
          <h2>Total Score: {scores.reduce((a, b) => a + b, 0)}/50</h2>
          <button className="btn btn-next" onClick={() => {
            const doc = new jsPDF();
            doc.text(`Score: ${scores.reduce((a, b) => a + b, 0)}/50`, 20, 20);
            doc.save("Report.pdf");
          }}>Download Report</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="dashboard-card">
        <h1>AI Interview Portal</h1>
        {interviewStep === 0 ? (
          <div>
            <input type="file" accept=".pdf" onChange={handleFileUpload} />
            <button className="btn btn-next" onClick={() => { setInterviewStep(1); fetchNextQuestion(); }}>Start Interview</button>
          </div>
        ) : (
          <div>
            <p>Step {interviewStep} of 5</p>
            <div className="question-box"><p>{question}</p></div>
            <textarea className="answer-area" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <button onClick={startListening} className={`btn-mic ${
      isListening ? 'listening' : ''}`}>🎤 Speak</button>
            {!currentFeedback ? (
              <button className="btn btn-submit" onClick={submitAndNext}>Submit Answer</button>
            ) : (
              <div>
                <p>Score: {currentFeedback.score}/10</p>
                <button className="btn btn-next" onClick={finishStep}>Next</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;