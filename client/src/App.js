import './App.css';

import axios from 'axios';
import {jsPDF} from 'jspdf';
import React, {useEffect, useRef, useState} from 'react';

const TOTAL_QUESTIONS = 10;
const TIME_PER_QUESTION = 120;

function App() {
  const [screen, setScreen] = useState('landing');
  const [interviewType, setInterviewType] = useState('Technical');
  const [difficulty, setDifficulty] = useState('Medium');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [confidence, setConfidence] = useState(3);
  const [isListening, setIsListening] = useState(false);
  const [interviewStep, setInterviewStep] = useState(0);
  const [currentFeedback, setCurrentFeedback] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [timerActive, setTimerActive] = useState(false);
  const [pasteWarning, setPasteWarning] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [showConfidence, setShowConfidence] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && timerActive) {
      handleTimeUp();
    }
    return () => clearTimeout(timerRef.current);
  }, [timerActive, timeLeft]);

  const handleTimeUp = async () => {
    setTimerActive(false);
    if (answer.trim()) {
      await submitAnswer();
    } else {
      const emptyResult = {
        totalScore: 0,
        accuracy: 0,
        communication: 0,
        depth: 0,
        aiDetected: false,
        aiFlagReason: '',
        feedback: 'Time ran out and no answer was provided.',
        improvement: 'Always attempt an answer even if unsure.',
        resources: []
      };
      setCurrentFeedback(emptyResult);
      setHistory(
          prev =>
              [...prev,
               {question, answer: '(no answer)', confidence, ...emptyResult}]);
    }
  };

  const startTimer = () => {
    setTimeLeft(TIME_PER_QUESTION);
    setTimerActive(true);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('resume', file);
    try {
      setIsLoading(true);
      setUploadStatus('uploading');
      const res =
          await axios.post('http://localhost:5000/upload-resume', formData);
      setUploadStatus(res.data.hasText ? 'ready' : 'no-text');
    } catch {
      setUploadStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const startInterview = () => {
    if (uploadStatus !== 'ready') {
      alert('Please upload a valid .docx resume first!');
      return;
    }
    setHistory([]);
    setInterviewStep(1);
    setScreen('interview');
    fetchNextQuestion(1);
  };

  const fetchNextQuestion = async (step) => {
    setAnswer('');
    setCurrentFeedback(null);
    setTimerActive(false);
    setPasteWarning(false);
    setShowConfidence(true);
    setSkipped(false);
    setConfidence(3);
    setIsLoading(true);
    try {
      const res = await axios.get(`http://localhost:5000/ask?questionNumber=${
          step}&type=${interviewType}&difficulty=${difficulty}`);
      setQuestion(res.data.question);
    } catch {
      setQuestion('Error connecting to AI.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmConfidence = () => {
    setShowConfidence(false);
    startTimer();
  };

  const handlePaste = () => {
    setPasteWarning(true);
    setTimeout(() => setPasteWarning(false), 4000);
  };

  const skipQuestion = () => {
    setTimerActive(false);
    clearTimeout(timerRef.current);
    setSkipped(true);
    const skippedResult = {
      totalScore: 0,
      accuracy: 0,
      communication: 0,
      depth: 0,
      aiDetected: false,
      aiFlagReason: '',
      feedback: 'Question was skipped.',
      improvement:
          'Try not to skip — even a partial answer scores better than none.',
      resources: []
    };
    setHistory(
        prev =>
            [...prev,
             {question, answer: '(skipped)', confidence, ...skippedResult}]);
    goNextStep();
  };

  const submitAnswer = async () => {
    if (!answer.trim()) return;
    setTimerActive(false);
    clearTimeout(timerRef.current);
    setIsLoading(true);
    try {
      const res = await axios.post(
          'http://localhost:5000/grade',
          {question, answer, type: interviewType, difficulty, confidence});
      const data = res.data.data;
      setCurrentFeedback(data);
      setHistory(prev => [...prev, {question, answer, confidence, ...data}]);
    } catch {
      alert('Grading failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const goNextStep = () => {
    if (interviewStep < TOTAL_QUESTIONS) {
      const next = interviewStep + 1;
      setInterviewStep(next);
      fetchNextQuestion(next);
    } else {
      setScreen('results');
    }
  };

  const retryInterview = () => {
    setHistory([]);
    setInterviewStep(0);
    setCurrentFeedback(null);
    setAnswer('');
    setScreen('landing');
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Use Chrome for voice input.');
      return;
    }
    const rec = new SR();
    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onresult = (e) => setAnswer(e.results[0][0].transcript);
    rec.start();
  };

  const downloadReport = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const totalScore = history.reduce((a, b) => a + b.totalScore, 0);

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('AI Interview Report', pageWidth / 2, 22, {align: 'center'});
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(
        `Type: ${interviewType} | Difficulty: ${difficulty} | Score: ${
            totalScore}/${TOTAL_QUESTIONS * 10}`,
        pageWidth / 2, 32, {align: 'center'});
    doc.line(15, 37, pageWidth - 15, 37);

    let y = 47;
    history.forEach((item, i) => {
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      const qLines =
          doc.splitTextToSize(`Q${i + 1}: ${item.question}`, pageWidth - 30);
      doc.text(qLines, 15, y);
      y += qLines.length * 6 + 3;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const aLines =
          doc.splitTextToSize(`Answer: ${item.answer}`, pageWidth - 30);
      doc.text(aLines, 15, y);
      y += aLines.length * 6 + 3;

      doc.setTextColor(0, 140, 70);
      doc.text(
          `Score: ${item.totalScore}/10 | Accuracy: ${
              item.accuracy}/10 | Communication: ${
              item.communication}/10 | Depth: ${item.depth}/10`,
          15, y);
      y += 7;

      if (item.aiDetected) {
        doc.setTextColor(255, 94, 94);
        doc.text(`AI Detected: ${item.aiFlagReason}`, 15, y);
        y += 7;
      }

      doc.setTextColor(60, 60, 60);
      const fLines =
          doc.splitTextToSize(`Feedback: ${item.feedback}`, pageWidth - 30);
      doc.text(fLines, 15, y);
      y += fLines.length * 6 + 3;

      const iLines =
          doc.splitTextToSize(`Tip: ${item.improvement}`, pageWidth - 30);
      doc.text(iLines, 15, y);
      y += iLines.length * 6 + 10;

      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(220, 220, 220);
      doc.line(15, y - 4, pageWidth - 15, y - 4);
    });

    doc.save('Interview_Report.pdf');
  };

  const getUploadLabel = () => {
    if (uploadStatus === 'uploading')
      return <><div className = 'spinner-sm'></div> Uploading...</>;
    if (uploadStatus === 'ready') return <><span>✅</span> Resume Ready!</>;
    if (uploadStatus === 'no-text')
      return <><span>⚠️</span> Could not read — try another .docx</>;
    if (uploadStatus === 'error')
      return <><span>❌</span> Upload failed — try again</>;
    return <><span>📄</span> Upload Resume (.docx) — Required</>;
  };

  const totalScore = history.reduce((a, b) => a + b.totalScore, 0);
  const maxScore = TOTAL_QUESTIONS * 10;
  const percentage = Math.round((totalScore / maxScore) * 100);
  const avgAccuracy = history.length ?
      Math.round(
          history.reduce((a, b) => a + b.accuracy, 0) / history.length * 10) :
      0;
  const avgCommunication = history.length ?
      Math.round(
          history.reduce((a, b) => a + b.communication, 0) / history.length *
          10) :
      0;
  const avgDepth = history.length ?
      Math.round(
          history.reduce((a, b) => a + b.depth, 0) / history.length * 10) :
      0;
  const aiFlags = history.filter(h => h.aiDetected).length;
  const timerColor = timeLeft > 60 ? '#00d4aa' :
      timeLeft > 30                ? '#f5a623' :
                                     '#ff5e5e';
  const timerPercent = (timeLeft / TIME_PER_QUESTION) * 100;
  const allResources = history.flatMap(h => h.resources || []);
  const skipsUsed = history.filter(h => h.answer === '(skipped)').length;

  if (screen === 'results') {
    return (
      <div className='app-wrapper'>
        <div className='finish-screen'>
          <div className='finish-header'>
            <div className='trophy'>🏆</div>
            <h1>Interview Complete</h1>
            <p className='interview-meta'>{
      interviewType} · {difficulty}</p>
            <div className="score-circle">
              <svg viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#1a1a2e" strokeWidth="8"/>
                <circle cx='60' cy='60' r='54' fill='none' stroke='#00d4aa' strokeWidth='8'
                  strokeDasharray={`${(percentage / 100) * 339} 339`}
                  strokeLinecap='round' transform='rotate(-90 60 60)'
                />
              </svg>
              <div className="score-text">
                <span className="score-num">{totalScore}</span>
                <span className='score-denom'>/{maxScore}</span>
              </div>
            </div>
            <p className='score-label'>
              {percentage >= 80 ? '🌟 Excellent!' : percentage >= 60 ? '👍 Good Job!' : '💪 Keep Practicing!'}
            </p>
            {aiFlags > 0 && (
              <div className="ai-warning-banner">
                ⚠️ {aiFlags} answer{aiFlags > 1 ? 's were' : ' was'} flagged as potentially AI-generated
              </div>
            )
  }
  <div className='breakdown-bars'>
              <div className='breakdown-row'>
                <span>Accuracy</span>
                <div className="breakdown-bar"><div className="breakdown-fill" style={{ width: `${avgAccuracy}%`, background: '#00d4aa' }}></div></div>
                <span>{avgAccuracy}%</span>
              </div>
              <div className="breakdown-row">
                <span>Communication</span>
                <div className='breakdown-bar'><div className='breakdown-fill' style={{ width: `${avgCommunication}%`, background: '#7b61ff' }}></div></div>
                <span>{avgCommunication}%</span>
              </div>
              <div className='breakdown-row'>
                <span>Depth</span>
                <div className="breakdown-bar"><div className="breakdown-fill" style={{ width: `${avgDepth}%`, background: '#f5a623' }}></div></div>
                <span>{avgDepth}%</span>
              </div>
            </div>
          </div>

          <div className="history-list">
            {history.map((item, i) => (
              <div key={i} className={`history-card ${item.aiDetected ? 'ai-flagged' : ''}`}>
                <div className="history-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="q-label">Q{i + 1}</span>
                    {item.answer === '(skipped)' && <span className='skip-badge'>Skipped</span>}
                    {item.aiDetected && <span className="ai-badge">🤖 AI Detected</span>}
                  </div>
                  <span className={`score-badge ${item.totalScore >= 7 ? 'high' : item.totalScore >= 5 ? 'mid' : 'low'}`}>
                    {item.totalScore}/10
                  </span>
                </div>
                <p className='history-question'>{item.question}</p>
                {item.aiDetected && <p className="ai-flag-reason">⚠️ {item.aiFlagReason}</p>
}
                <div className='mini-scores'>
                  <span>Accuracy: {item.accuracy}/10</span>
                  <span>Communication: {item.communication}/10</span>
                  <span>Depth: {item.depth}/10</span>
                  <span>Confidence: {item.confidence}/5</span>
                </div>
                <p className="history-feedback">{item.feedback}</p>
                <p className='history-tip'>💡 {item.improvement}</p>
              </div>
            ))
                }
          </div>

          {allResources.length > 0 && (
            <div className="resources-section">
              <h3 className="resources-title">📚 Suggested Resources to Improve</h3>
              <div className='resources-list'>
                {allResources.slice(0, 6).map((r, i) => (
                  <a key={i} href={r.url} target='_blank' rel='noreferrer' className='resource-card'>
                    <span className='resource-title'>{r.title}</span>
                    <span className="resource-reason">{r.reason}</span>
                    <span className='resource-link'>Visit →</span>
                  </a>
                ))}
              </div>
            </div>
          )
          }

          <div className = 'result-buttons'>
              <button className = 'btn-retry' onClick = {retryInterview}>🔄 Try Again<
                  /button>
            <button className="btn-download" onClick={downloadReport}>📄 Download Report</button>
              </div>
        </div>
              </div>
    );
  }

  if (screen === 'interview') {
    return (
      <div className="app-wrapper">
        <div className="sidebar">
          <div className="logo">
            <span className="logo-icon">⚡</span>
              <span className = 'logo-text'>InterviewAI</span>
          </div>
              <div className = 'interview-meta-side'>
              <span className = 'type-badge'>{interviewType} <
              /span>
            <span className="diff-badge">{difficulty}</span >
              </div>
          <div className="progress-section">
            <p className="progress-label">Progress</p>
              <div className = 'progress-steps'> {Array.from({ length: TOTAL_QUESTIONS }, (_, i) => i + 1).map(s => (
                <div key={s} className={`step-dot ${s < interviewStep ? 'done' : s === interviewStep ? 'active' : ''}`}>
                  {s < interviewStep ? '✓' : s}
                </div>
              ))}
            </div>
            <div className='progress-bar'>
              <div className='progress-fill' style={{
    width: `${((interviewStep - 1) / TOTAL_QUESTIONS) * 100}%` }}></div>
            </div>
            <p className='progress-text'>{interviewStep} of {TOTAL_QUESTIONS} questions</p>
          </div>
          {skipsUsed > 0 && (
            <div className='skips-info'>
              <p className='progress-label'>Skips Used</p>
              <p className="skips-text">{skipsUsed} question{skipsUsed > 1 ? 's' : ''} skipped</p>
            </div>
          )}
          {history.length > 0 && (
            <div className="live-scores">
              <p className="progress-label">Scores So Far</p>
              {history.map((item, i) => (
                <div key={i} className='score-row'>
                  <span>Q{i + 1}</span>
                  <div className="score-bar-wrap">
                    <div className="score-bar-fill" style={{ width: `${item.totalScore * 10}%` }}></div>
                  </div>
                  <span>{item.answer === '(skipped)' ? 'Skip' : `${item.totalScore}/10`}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="main-content">
          <div className="interview-area">
            <div className="interview-top">
              <span className="question-tag">Question {interviewStep} of {TOTAL_QUESTIONS}</span>
              {timerActive && (
                <div className="timer" style={{ color: timerColor }}>
                  <svg viewBox="0 0 36 36" className="timer-svg">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1a1a2e" strokeWidth="3"/>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke={timerColor} strokeWidth="3"
                      strokeDasharray={`${
        timerPercent} 100`}
                      strokeLinecap="round" transform="rotate(-90 18 18)"
                    />
                  </svg>
                  <span>{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</span>
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="loading-state">
                <div className="pulse-ring"></div>
                <p>AI is thinking...</p>
              </div>
            ) : showConfidence && !currentFeedback ? (
              <div className="confidence-panel">
                <h3>How confident are you about this topic?</h3>
                <p className="question-preview">{question}</p>
                <div className="confidence-options">
                  {[1,2,3,4,5].map(c => (
                    <button key={c} className={`conf-btn ${
        confidence === c ? 'active' : ''}`} onClick={() => setConfidence(c)}>
                      <span>{c === 1 ? '😰' : c === 2 ? '😟' : c === 3 ? '😐' : c === 4 ? '🙂' : '😎'}</span>
                      <span>{c === 1 ? 'Not at all' : c === 2 ? 'Slightly' : c === 3 ? 'Somewhat' : c === 4 ? 'Confident' : 'Very confident'}</span>
                    </button>
                  ))}
                </div>
                <div className="confidence-actions">
                  <button className="btn-skip" onClick={skipQuestion}>Skip this Question</button>
                  <button className="btn-start-answer" onClick={handleConfirmConfidence}>Start Answering →</button>
                </div>
              </div>
            ) : (
              <>
                <div className="question-card"><p>{question}</p></div>
                {pasteWarning && (
                  <div className="paste-warning">
                    ⚠️ Paste detected! Pasted answers may be flagged during grading.
                  </div>
                )}
                {!currentFeedback ? (
                  <>
                    <textarea
                      className="answer-input"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onPaste={handlePaste}
                      placeholder="Type your answer here..."
                      rows={5}
                    />
                    <div className="action-row">
                      <button className={`btn-mic ${
        isListening ? 'active' : ''}`} onClick={startListening}>
                        {isListening ? '🔴 Listening...' : '🎤 Speak'}
                      </button>
                      <button className="btn-skip-inline" onClick={skipQuestion}>
                        Skip
                      </button>
                      <button className="btn-submit" onClick={submitAnswer} disabled={!answer.trim()}>
                        Submit →
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="feedback-panel">
                    {currentFeedback.aiDetected && (
                      <div className="ai-detected-banner">
                        🤖 AI-generated answer detected — {currentFeedback.aiFlagReason}
                      </div>
                    )}
                    <div className="feedback-score">
                      <div className={`score-pill ${
        currentFeedback.totalScore >= 7     ? 'high' :
            currentFeedback.totalScore >= 5 ? 'mid' :
                                              'low'}`}>
                        {currentFeedback.totalScore}/10
                      </div>
                      <span>{currentFeedback.totalScore >= 7 ? 'Great answer!' : currentFeedback.totalScore >= 5 ? 'Decent answer' : 'Needs improvement'}</span>
                    </div>
                    <div className="score-breakdown">
                      <div className="breakdown-item"><span>Accuracy</span><strong>{currentFeedback.accuracy}/10</strong></div>
                      <div className="breakdown-item"><span>Communication</span><strong>{currentFeedback.communication}/10</strong></div>
                      <div className="breakdown-item"><span>Depth</span><strong>{currentFeedback.depth}/10</strong></div>
                    </div>
                    <p className="feedback-text">{currentFeedback.feedback}</p>
                    <p className="feedback-tip">💡 {currentFeedback.improvement}</p>
                    {currentFeedback.resources && currentFeedback.resources.length > 0 && (
                      <div className="inline-resources">
                        <p className="inline-resources-title">📚 Resources:</p>
                        {currentFeedback.resources.map((r, i) => (
                          <a key={i} href={r.url} target="_blank" rel="noreferrer" className="inline-resource-link">{r.title} →</a>
                        ))}
                      </div>
                    )}
                    <button className="btn-next" onClick={goNextStep}>
                      {interviewStep < TOTAL_QUESTIONS ? 'Next Question →' : 'See Results 🏁'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <div className="main-content" style={{ justifyContent: 'center' }}>
        <div className="landing">
          <div className="landing-badge">AI-Powered Interview Simulator</div>
          <h1 className="landing-title">Ace Your Next<br /><span className="accent">Interview</span></h1>
          <p className="landing-sub">Upload your resume, choose your type and difficulty, then get started.</p>

          <div className="config-row">
            <div className="config-group">
              <p className="config-label">Interview Type</p>
              <div className="config-options">
                {['Technical', 'HR', 'Behavioral'].map(t => (
                  <button key={t} className={`config-btn ${
        interviewType === t ? 'active' : ''}`} onClick={() => setInterviewType(t)}>{t}</button>
                ))}
              </div>
            </div>
            <div className="config-group">
              <p className="config-label">Difficulty</p>
              <div className="config-options">
                {['Easy', 'Medium', 'Hard'].map(d => (
                  <button key={d} className={`config-btn diff-${d.toLowerCase()} ${
        difficulty === d ? 'active' : ''}`} onClick={() => setDifficulty(d)}>{d}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="upload-area">
            <label className="upload-label" htmlFor="resume-upload">{getUploadLabel()}</label>
            <input id="resume-upload" type="file" accept=".docx" onChange={handleFileUpload} style={{ display: 'none' }} />
          </div>

          <button
            className="btn-start"
            onClick={startInterview}
            style={{ opacity: uploadStatus === 'ready' ? 1 : 0.5 }}
          >
            {uploadStatus === 'ready' ? 'Start Interview →' : 'Upload Resume to Start'}
          </button>

          <div className="features">
            <div className="feature"><span>🤖</span><p>AI Detection</p></div>
            <div className="feature"><span>⏱️</span><p>2 Min Timer</p></div>
            <div className="feature"><span>📊</span><p>Deep Scoring</p></div>
            <div className="feature"><span>📚</span><p>Resources</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;