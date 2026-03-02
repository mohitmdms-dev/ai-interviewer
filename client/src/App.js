import './App.css';

import axios from 'axios';
import {jsPDF} from 'jspdf';
import React, {useCallback, useEffect, useRef, useState} from 'react';

const TOTAL_QUESTIONS = 5;
const TIME_PER_QUESTION = 420;

const LEVELS = [
  {id: 'intern', label: 'Intern', icon: '🌱', desc: 'No experience'},
  {id: 'junior', label: 'Junior', icon: '🔧', desc: '1–2 years'},
  {id: 'mid', label: 'Mid-Level', icon: '⚙️', desc: '3–5 years'},
  {id: 'senior', label: 'Senior', icon: '🚀', desc: '6–10 years'},
  {id: 'principal', label: 'Principal', icon: '🏛️', desc: '10+ years'},
];

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function App() {
  const [screen, setScreen] =
      useState('landing');  // landing | prep | interview | results
  const [interviewType, setInterviewType] = useState('Technical');
  const [difficulty, setDifficulty] = useState('Medium');
  const [level, setLevel] = useState('mid');
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [questionPlans, setQuestionPlans] = useState([]);
  const [isAnalysing, setIsAnalysing] = useState(false);

  // interview state
  const [interviewStep, setInterviewStep] = useState(0);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [questionConversation, setQuestionConversation] = useState([]);
  const [questionStarted, setQuestionStarted] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [history, setHistory] = useState([]);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [timerActive, setTimerActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [pasteWarning, setPasteWarning] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionId] = useState(genId);

  const timerRef = useRef(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages, isTyping]);

  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && timerActive) {
      setTimerActive(false);
      addMsg('system', '⏰ Time\'s up! Grading now...');
      gradeCurrentQuestion();
    }
    return () => clearTimeout(timerRef.current);
  }, [timerActive, timeLeft]);

  // TTS
  const speakText = useCallback((text) => {
    if (!audioEnabled) return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const clean = text.replace(/[*_`#>]/g, '').replace(/\n/g, ' ').trim();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.rate = 0.9;
    utter.pitch = 1.02;
    utter.volume = 1;
    const voices = synth.getVoices();
    const preferred =
        voices.find(
            v => v.name.includes('Google UK English Female') ||
                v.name.includes('Google US English') ||
                v.name.includes('Samantha') || v.name.includes('Karen') ||
                (v.lang === 'en-GB')) ||
        voices.find(v => v.lang.startsWith('en'));
    if (preferred) utter.voice = preferred;
    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);
    synth.speak(utter);
  }, [audioEnabled]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (synth) {
      synth.getVoices();
      synth.addEventListener('voiceschanged', () => synth.getVoices());
    }
  }, []);

  const addMsg = (role, content) => {
    setMessages(prev => [...prev, {role, content, ts: new Date()}]);
  };

  // ─── FILE UPLOAD ─────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('resume', file);
    try {
      setIsLoading(true);
      setUploadStatus('uploading');
      const res = await axios.post('http://localhost:5000/upload-resume', fd);
      setUploadStatus(res.data.hasText ? 'ready' : 'no-text');
    } catch {
      setUploadStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── ANALYSE RESUME ───────────────────────────────────────
  const analyseResume = async () => {
    if (uploadStatus !== 'ready') {
      alert('Please upload a valid .docx resume first!');
      return;
    }
    setIsAnalysing(true);
    try {
      const res = await axios.post(
          'http://localhost:5000/analyse-resume',
          {type: interviewType, difficulty, level});
      setQuestionPlans(res.data.plans);
      setScreen('prep');
    } catch {
      alert('Could not analyse resume. Please retry.');
    } finally {
      setIsAnalysing(false);
    }
  };

  // ─── START INTERVIEW ──────────────────────────────────────
  const startInterview = () => {
    setHistory([]);
    setInterviewStep(1);
    setScreen('interview');
    loadQuestion(1, questionPlans);
  };

  // ─── LOAD QUESTION ────────────────────────────────────────
  const loadQuestion = async (step, plans) => {
    const plan = plans[step - 1];
    setMessages([]);
    setCurrentFeedback(null);
    setQuestionStarted(false);
    setQuestionConversation([]);
    setTimerActive(false);
    setTimeLeft(TIME_PER_QUESTION);
    setInputText('');
    stopSpeaking();
    setIsTyping(true);
    try {
      const res = await axios.post('http://localhost:5000/start-question', {
        questionNumber: step,
        type: interviewType,
        difficulty,
        level,
        area: plan.area,
        angle: plan.angle,
        sessionId: `${sessionId}-q${step}`,
      });
      setIsTyping(false);
      addMsg('interviewer', res.data.message);
      setQuestionConversation([{role: 'assistant', content: res.data.message}]);
      setQuestionStarted(true);
      setTimerActive(true);
      speakText(res.data.message);
    } catch {
      setIsTyping(false);
      addMsg('system', 'Connection error. Please refresh.');
    }
  };

  // ─── SEND MESSAGE ─────────────────────────────────────────
  const sendMessage = async () => {
    if (!inputText.trim() || isTyping) return;
    stopSpeaking();
    const userMsg = inputText.trim();
    setInputText('');
    addMsg('candidate', userMsg);
    setQuestionConversation(
        prev => [...prev, {role: 'user', content: userMsg}]);
    setIsTyping(true);
    try {
      const res = await axios.post('http://localhost:5000/chat', {
        message: userMsg,
        sessionId: `${sessionId}-q${interviewStep}`,
      });
      setIsTyping(false);
      if (res.data.message) {
        addMsg('interviewer', res.data.message);
        setQuestionConversation(
            prev => [...prev, {role: 'assistant', content: res.data.message}]);
        speakText(res.data.message);
      }
      if (res.data.isComplete) setTimeout(() => gradeCurrentQuestion(), 700);
    } catch {
      setIsTyping(false);
      addMsg('system', 'Connection error. Try again.');
    }
  };

  // ─── GRADE ────────────────────────────────────────────────
  const gradeCurrentQuestion = async () => {
    setTimerActive(false);
    clearTimeout(timerRef.current);
    stopSpeaking();
    setIsLoading(true);
    addMsg('system', '📊 Evaluating your answer against your resume...');
    const plan = questionPlans[interviewStep - 1];
    try {
      const res = await axios.post('http://localhost:5000/grade', {
        conversation: questionConversation,
        questionNumber: interviewStep,
        type: interviewType,
        difficulty,
        level,
        area: plan.area,
        angle: plan.angle,
      });
      setCurrentFeedback(res.data.data);
      setHistory(prev => [...prev, {
                   questionNumber: interviewStep,
                   area: plan.area,
                   angle: plan.angle,
                   whyThisQuestion: plan.whyThisQuestion,
                   ...res.data.data,
                 }]);
    } catch {
      addMsg('system', 'Grading failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── NEXT QUESTION ────────────────────────────────────────
  const goNext = () => {
    stopSpeaking();
    if (interviewStep < TOTAL_QUESTIONS) {
      const n = interviewStep + 1;
      setInterviewStep(n);
      loadQuestion(n, questionPlans);
    } else {
      setScreen('results');
    }
  };

  const skipQuestion = () => {
    clearTimeout(timerRef.current);
    stopSpeaking();
    const plan = questionPlans[interviewStep - 1];
    setHistory(
        prev => [...prev, {
          questionNumber: interviewStep,
          area: plan?.area || 'Skipped',
          angle: plan?.angle || '',
          whyThisQuestion: '',
          totalScore: 0,
          knowledgeScore: 0,
          confidenceScore: 0,
          accuracy: 0,
          depth: 0,
          problemSolving: 0,
          resumeAlignment: 0,
          aiDetected: false,
          aiFlagReason: '',
          feedback: 'Question was skipped.',
          strengths: 'N/A',
          improvement:
              'Attempt every question — partial answers score better than skipping.',
          resources: [],
        }]);
    if (interviewStep < TOTAL_QUESTIONS) {
      const n = interviewStep + 1;
      setInterviewStep(n);
      loadQuestion(n, questionPlans);
    } else {
      setScreen('results');
    }
  };

  // ─── VOICE INPUT ──────────────────────────────────────────
  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Voice input requires Chrome.');
      return;
    }
    stopSpeaking();
    const rec = new SR();
    rec.continuous = false;
    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onresult = (e) => {
      const t = e.results[0][0].transcript;
      setInputText(prev => prev ? prev + ' ' + t : t);
      inputRef.current?.focus();
    };
    rec.start();
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ─── RETRY ────────────────────────────────────────────────
  const retry = () => {
    stopSpeaking();
    setHistory([]);
    setInterviewStep(0);
    setCurrentFeedback(null);
    setMessages([]);
    setInputText('');
    setQuestionPlans([]);
    setUploadStatus('idle');
    setScreen('landing');
  };

  // ─── PDF REPORT ───────────────────────────────────────────
  const downloadReport = () => {
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    const total = history.reduce((a, b) => a + b.totalScore, 0);
    const sel = LEVELS.find(l => l.id === level);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(
        'AI Interview Report — Resume Based', pw / 2, 20, {align: 'center'});
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(
        `Level: ${sel?.label} | Type: ${interviewType} | Difficulty: ${
            difficulty} | Score: ${total}/${TOTAL_QUESTIONS * 10}`,
        pw / 2, 30, {align: 'center'});
    doc.line(15, 35, pw - 15, 35);
    let y = 43;
    history.forEach((item, i) => {
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`Q${i + 1}: ${item.area}`, 15, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(0, 140, 70);
      doc.text(
          `Overall: ${item.totalScore}/10 | Knowledge: ${
              item.knowledgeScore}/10 | Confidence: ${
              item.confidenceScore}/10 | Resume Alignment: ${
              item.resumeAlignment}/10`,
          15, y);
      y += 7;
      doc.setTextColor(40, 40, 40);
      const fl = doc.splitTextToSize(`Feedback: ${item.feedback}`, pw - 30);
      doc.text(fl, 15, y);
      y += fl.length * 6 + 3;
      const il = doc.splitTextToSize(`Improve: ${item.improvement}`, pw - 30);
      doc.text(il, 15, y);
      y += il.length * 6 + 10;
      doc.setDrawColor(220, 220, 220);
      doc.line(15, y - 4, pw - 15, y - 4);
      doc.setTextColor(0, 0, 0);
    });
    doc.save('Resume_Interview_Report.pdf');
  };

  // ─── COMPUTED ─────────────────────────────────────────────
  const totalScore = history.reduce((a, b) => a + b.totalScore, 0);
  const maxScore = TOTAL_QUESTIONS * 10;
  const percentage = Math.round((totalScore / maxScore) * 100);
  const avg = (k) => history.length ?
      Math.round(
          history.reduce((a, b) => a + (b[k] || 0), 0) / history.length * 10) :
      0;
  const aiFlags = history.filter(h => h.aiDetected).length;
  const timerColor = timeLeft > 240 ? '#a8ff78' :
      timeLeft > 90                 ? '#f5a623' :
                                      '#ff5e5e';
  const timerPct = (timeLeft / TIME_PER_QUESTION) * 100;
  const allResources = history.flatMap(h => h.resources || []);
  const selLevel = LEVELS.find(l => l.id === level);
  const curPlan = questionPlans[interviewStep - 1];

  const uploadLabel = () => {
    if (uploadStatus === 'uploading')
      return <><span className = 'spin'>↻</span> Uploading...</>;
    if (uploadStatus === 'ready') return <><span>✅</span> Resume Ready</>;
    if (uploadStatus === 'no-text')
      return <><span>⚠️</span> Unreadable — try another .docx</>;
    if (uploadStatus === 'error')
      return <><span>❌</span> Failed — try again</>;
    return <><span>📄</span> Upload Resume (.docx) — Required</>;
  };

  // ═══════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════
  if (screen === 'results') return (
    <div className='results-page'>
      <div className='rp-inner'>
        <header className='rp-header'>
          <p className='rp-tag'>{selLevel?.icon} {
      selLevel?.label} · {
      interviewType} · {difficulty}</p>
          <h1>Your Results</h1>
          <p className='rp-sub'>Questions were tailored specifically to your resume</p>
        </header>

        <div className='rp-scoreboard'>
          <div className='rps-ring-wrap'>
            <svg viewBox='0 0 200 200'>
              <defs>
                <linearGradient id='sg' x1='0%' y1='0%' x2='100%' y2='100%'>
                  <stop offset='0%' stopColor='#a8ff78'/>
                  <stop offset='100%' stopColor='#78ffd6'/>
                </linearGradient>
              </defs>
              <circle cx='100' cy='100' r='86' fill='none' stroke='rgba(255,255,255,0.04)' strokeWidth='14'/>
              <circle cx='100' cy='100' r='86' fill='none' stroke='url(#sg)' strokeWidth='14'
    strokeDasharray = {`${(percentage / 100)* 540} 540`} strokeLinecap =
        'round' transform = 'rotate(-90 100 100)' / >
        </svg>
            <div className="rps-ring-text">
              <span className="rps-num">{totalScore}</span><
        span className = 'rps-den' > /{maxScore}</span >
        <span className = 'rps-pct'>{percentage} %
            </span>
            </div>
            </div>

          <div className="rps-metrics">
            <div className="rpsm-verdict">
              {percentage >= 85 ? '🌟 Outstanding' : percentage >= 70 ? '👍 Strong' : percentage >= 50 ? '📈 Developing' : '💪 Keep Practicing'}
            </div>{
              aiFlags > 0 &&<div className = 'rpsm-ai-warn'>⚠️ {aiFlags} answer{
                            aiFlags > 1 ? 's' : ''} flagged as
              AI -
                  generated<
                      /div>}
            <div className="rpsm-bars">
              {[
                { label: 'Knowledge',        key: 'knowledgeScore',   color: '#a8ff78', weight: '80%' },
                { label: 'Confidence',       key: 'confidenceScore',  color: '#78ffd6', weight: '20%' },
                { label: 'Resume Alignment', key: 'resumeAlignment',  color: '#ffd700' },
                { label: 'Depth',            key: 'depth',            color: '#ff9d6c' },
                { label: 'Problem Solving',  key: 'problemSolving',   color: '#d4a8ff' },
                { label: 'Accuracy',         key: 'accuracy',         color: '#78b8ff' },
              ].map(m => (
                <div key={m.key} className="rpsm-bar-row">
                  <span className="rpsm-bl">{m.label}{m.weight && <em>{m.weight}</em>
            } <
        /span>
                  <div className="rpsm-btrack">
                    <div className="rpsm-bfill" style={{ width: `${avg(m.key)}%`, background: m.color }}></div >
        </div>
                  <span className="rpsm-bv">{avg(m.key)}%</span>
        </div>
              ))}
            </div></div>
        </div>

        <
                             div className =
                                 'rp-section-title'>Question Breakdown</div>
        <div className="rp-cards">
          {history.map((item, i) => (
            <div key={i} className={`rpc ${item.aiDetected ? 'flagged' : ''}`}>
              <div className="rpc-head">
                <div className="rpc-left">
                  <span className="rpc-num">Q{i + 1}</span>
        <div className = 'rpc-area-wrap'>
        <span className = 'rpc-area'>{item.area} <
        /span>
                    <span className="rpc-angle">{item.angle}</span >
        </div>
                  {item.aiDetected && <span className="rpc-ai-tag">🤖 AI</span>
}
</div>
                <div className="rpc-scores">
                  <span className="rpcs k">K:{item.knowledgeScore}</span>
    <span className = 'rpcs c'>C: {item.confidenceScore} <
    /span>
                  <span className="rpcs ra">R:{item.resumeAlignment}</span >
    <span className = {`rpcs total ${
         item.totalScore >= 7     ? 'hi' :
             item.totalScore >= 5 ? 'md' :
                                    'lo'}`}> {
  item.totalScore
}/10</span>
                </div>
              </div>
              {item.whyThisQuestion && <p className='rpc-why'>📌 {item.whyThisQuestion}</p>}
              {item.aiDetected && <p className="rpc-ai-reason">⚠️ {item.aiFlagReason}</p>}
              <p className='rpc-feedback'>{item.feedback}</p>
              <p className="rpc-strength">✅ {item.strengths}</p>
              <p className='rpc-tip'>💡 {item.improvement}</p>
            </div>
          ))
}
        </div>

        {allResources.length > 0 && (
          <>
            <div className="rp-section-title">📚 Recommended Resources</div>
            <div className='rp-resources'>
              {allResources.slice(0, 6).map((r, i) => (
                <a key={i} href={r.url} target='_blank' rel='noreferrer' className='rpr-card'>
                  <span className='rpr-title'>{r.title}</span>
                  <span className="rpr-reason">{r.reason}</span>
                  <span className='rpr-cta'>Visit →</span>
                </a>
              ))}
            </div>
          </>
        )
        }

        <div className='rp-actions'>
          <button className='btn-ghost' onClick={retry}>🔄 New Interview</button>
          <button className="btn-solid" onClick={downloadReport}>📄 Download Report</button>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // PREP (question preview before starting)
  // ═══════════════════════════════════════════════════════════
  if (screen === 'prep') return (
    <div className='prep-page'>
      <div className='pp-inner'>
        <div className='pp-header'>
          <div className='pp-tag'>Resume Analysis Complete</div>
          <h1 className="pp-title">Your 5 Questions<br />Are Ready</h1>
          <p className="pp-sub">
            Based on your resume, the AI has prepared <strong>5 unique questions</strong> across different areas of your experience.
            Each question tests a different aspect of your background.
          </p>
        </div>

        <div className='pp-plan-grid'>
          {questionPlans.map((plan, i) => (
            <div key={i} className='ppg-card'>
              <div className='ppgc-num'>{i + 1}</div>
              <div className="ppgc-body">
                <span className="ppgc-area">{plan.area}</span>
                <span className='ppgc-angle'>{plan.angle}</span>
                <span className="ppgc-why">{plan.whyThisQuestion}</span>
              </div>
              <div className="ppgc-dot"></div>
            </div>
          ))}
        </div>

        <div className='pp-info-row'>
          <div className='pp-info-card'>
            <span>🔊</span>
            <p>Questions read aloud</p>
          </div>
          <div className="pp-info-card">
            <span>🧠</span>
            <p>AI follow-ups per question</p>
          </div>
          <div className='pp-info-card'>
            <span>📊</span>
            <p>80% Knowledge · 20% Confidence</p>
          </div>
          <div className="pp-info-card">
            <span>⏱️</span>
            <p>7 minutes per question</p>
          </div>
        </div>

        <div className="pp-actions">
          <button className="btn-ghost" onClick={() => setScreen('landing')}>← Back</button>
          <button className='btn-solid' onClick={startInterview}>Begin Interview →</button>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // INTERVIEW
  // ═══════════════════════════════════════════════════════════
  if (screen === 'interview') return (
    <div className='iv-layout'>
      {/* SIDEBAR */}
      <aside className='iv-side'>
        <div className='ivs-brand'>
          <span className='ivs-logo-icon'>◈</span>
          <span className="ivs-logo-text">InterviewAI</span>
        </div>

        <div className="ivs-config">
          <span className="ivs-badge type">{interviewType}</span>
          <span className='ivs-badge level'>{selLevel?.icon} {selLevel?.label}</span>
          <span className="ivs-badge diff">{difficulty}</span>
        </div>

        <div className="ivs-block">
          <p className="ivs-blabel">Progress</p>
          <div className='ivs-dots'>
            {Array.from({ length: TOTAL_QUESTIONS }, (_, i) => i + 1).map(s => (
              <div key={s} className={`ivs-dot ${s < interviewStep ? 'done' : s === interviewStep ? 'now' : ''}`}>
                {s < interviewStep ? '✓' : s}
              </div>
            ))}
          </div>
          <div className='ivs-prog'><div style={{
    width: `${((interviewStep - 1) / TOTAL_QUESTIONS) * 100}%` }}></div></div>
          <p className='ivs-prog-label'>{
    interviewStep} / {TOTAL_QUESTIONS}</p>
        </div>

        {curPlan && (
          <div className="ivs-block">
            <p className="ivs-blabel">Current Topic</p>
            <div className='ivs-cur-area'>{curPlan.area}</div>
            <div className="ivs-cur-angle">{curPlan.angle}</div>
          </div>
        )}

        <div className="ivs-block">
          <p className="ivs-blabel">All Questions</p>
          <div className='ivs-q-list'>
            {questionPlans.map((plan, i) => (
              <div key={i} className={`ivs-q-item ${i + 1 < interviewStep ? 'done' : i + 1 === interviewStep ? 'now' : ''}`}>
                <span className='ivs-qi-n'>{i + 1}</span>
                <span className="ivs-qi-a">{plan.area}</span>
                {i + 1 < interviewStep && <span className='ivs-qi-check'>✓</span>}
              </div>
            ))}
          </div>
        </div>

        {timerActive && (
          <div className='ivs-block'>
            <p className='ivs-blabel'>Time Left</p>
            <div className="ivs-timer-wrap">
              <svg viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4"/>
                <circle cx='30' cy='30' r='26' fill='none' stroke={timerColor} strokeWidth='4'
                  strokeDasharray={`${timerPct * 1.634} 163.4`}
                  strokeLinecap='round' transform='rotate(-90 30 30)'
                />
              </svg>
              <span style={{ color: timerColor }}>
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
              </span>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="ivs-block">
            <p className="ivs-blabel">Scores</p>
            {history.map((item, i) => (
              <div key={i} className='ivs-sr'>
                <span>{i + 1}</span>
                <div className="ivs-sr-bar"><div style={{ width: `${item.totalScore * 10}%` }}></div></div>
                <span>{item.totalScore}/10</span>
              </div>
            ))}
          </div>
        )}

        <div
          className="ivs-audio-btn"
          onClick={() => { if (audioEnabled) stopSpeaking(); setAudioEnabled(p => !p); }}
        >
          <span>{audioEnabled ? '🔊' : '🔇'}</span>
          <span>{audioEnabled ? 'Audio On' : 'Audio Off'}</span>
        </div>

        <button className='ivs-skip-btn' onClick={skipQuestion}>Skip →</button>
      </aside>

      {/* CHAT */}
      <main className='iv-chat'>
        <div className='ivc-header'>
          <div className='ivch-info'>
            <div className='ivch-av-wrap'>
              <div className='ivch-av'>AI</div>
              {isSpeaking && <div className="ivch-pulse"></div>}
            </div>
            <div>
              <p className="ivch-name">Senior Interviewer</p>
              <p className='ivch-status'>{isSpeaking ? '🔊 Speaking...' : isTyping ? '✍️ Typing...' : '🟢 Online'}</p>
            </div>
          </div>
          <div className="ivch-meta">
            {curPlan && <div className="ivch-area-pill">{curPlan.area}</div>}
            <div className='ivch-score-pills'>
              <span className='ivch-k'>Knowledge 80%</span>
              <span className="ivch-c">Confidence 20%</span>
            </div>
          </div>
        </div>

        <div className="ivc-msgs" id="msgs">
          {messages.length === 0 && (
            <div className="ivcm-empty">
              <div className="ivcme-ring"></div>
              {curPlan
                ? <p>Preparing question about <strong>{curPlan.area}</strong> from your resume...</p>
                : <p>Loading...</p>}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`ivcm-row ${m.role}`}>
              {m.role === 'interviewer' && <div className='ivcm-av iv-av'>AI</div>}
              <div className={`ivcm-bub ${m.role}`}>
                {m.content}
                <span className="ivcm-ts">{m.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {m.role === 'candidate' && <div className="ivcm-av you-av">You</div>}
            </div>
          ))}

          {isTyping && (
            <div className="ivcm-row interviewer">
              <div className="ivcm-av iv-av">AI</div>
              <div className='ivcm-bub interviewer typing-bub'>
                <span></span><span></span><span></span>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="ivcm-row system">
              <div className="ivcm-bub sys-bub">
                <span className="ld"><span></span><span></span><span></span></span>
                Evaluating answer against your resume...
              </div>
            </div>
          )}
          <div ref={chatEndRef}></div>
        </div>

        {currentFeedback && (
          <div className="ivc-fb">
            {currentFeedback.aiDetected && (
              <div className="ivcfb-ai-bar">🤖 AI-generated response detected — {currentFeedback.aiFlagReason}</div>
            )}
            <div className='ivcfb-top'>
              <div className={`ivcfb-total ${currentFeedback.totalScore >= 7 ? 'hi' : currentFeedback.totalScore >= 5 ? 'md' : 'lo'}`}>
                {
    currentFeedback.totalScore}/10
              </div>
              <div className='ivcfb-pills'>
                {[
                  { label: 'Knowledge', val: currentFeedback.knowledgeScore, cls: 'k', sub: '80%' },
                  { label: 'Confidence', val: currentFeedback.confidenceScore, cls: 'c', sub: '20%' },
                  { label: 'Resume Fit', val: currentFeedback.resumeAlignment, cls: 'r' },
                  { label: 'Depth', val: currentFeedback.depth, cls: '' },
                  { label: 'Problem Solving', val: currentFeedback.problemSolving, cls: '' },
                  { label: 'Accuracy', val: currentFeedback.accuracy, cls: '' },
                ].map((p, i) => (
                  <div key={i} className={`ivcfbp ${p.cls}`}>
                    <span>{p.label}</span>
                    <strong>{p.val}/10</strong>
                    {p.sub && <small>{p.sub}</small>}
                  </div>
                ))}
              </div>
            </div>
            <p className="ivcfb-text">{currentFeedback.feedback}</p>
            <p className='ivcfb-strength'>✅ {currentFeedback.strengths}</p>
            <p className="ivcfb-tip">💡 {currentFeedback.improvement}</p>
            {currentFeedback.resources?.length > 0 && (
              <div className='ivcfb-res'>
                <span>📚</span>
                {currentFeedback.resources.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noreferrer">{r.title} →</a>
                ))}
              </div>
            )}
            <button className="btn-solid w100" onClick={goNext}>
              {interviewStep < TOTAL_QUESTIONS ? 'Next Question →' : 'See Results 🏁'}
            </button>
          </div>
        )}

        {!currentFeedback && questionStarted && (
          <div className="ivc-input">
            {pasteWarning && <div className="ivc-paste-warn">⚠️ Paste detected — may affect grading</div>}
            {
  isSpeaking && (<div className = 'ivc-speaking'><div className = 'ivcs-bars'> {[...Array(5)].map((_, i) => <span key={i}></span>)}
                </div>
                <span>Interviewer speaking...</span>
                <button onClick={stopSpeaking}>Stop ✕</button>
              </div>
            )}
            <div className="ivc-input-row">
              <textarea
                ref={inputRef}
                className="ivc-ta"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKey}
                onPaste={() => { setPasteWarning(true); setTimeout(() => setPasteWarning(false), 4000); }}
                placeholder="Type your answer... (Enter to send, Shift+Enter for new line)"
                rows={3}
                disabled={isTyping}
              />
              <div className='ivc-action-btns'>
                <button className={`ivc-mic-btn ${isListening ? 'listening' : ''}`} onClick={startListening}>
                  {isListening ? '🔴' : '🎤'}
                </button>
                <button className="ivc-send-btn" onClick={sendMessage} disabled={!inputText.trim() || isTyping}>
                  ↑
                </button>
              </div>
            </div>
            <p className='ivc-hint'>Enter to send · Shift+Enter for new line · The interviewer will probe your answer</p>
          </div>
        )
  } < /main>
    </div >);

  // ═══════════════════════════════════════════════════════════
  // LANDING
  // ═══════════════════════════════════════════════════════════
  return (
    <div className='land'>
      <div className='land-bg'>
        <div className='lb-grid'></div>
        <div className="lb-glow g1"></div>
        <div className='lb-glow g2'></div>
      </div>
      <div className='land-body'>
        <div className='land-left'>
          <div className='land-eyebrow'>Resume-Driven AI Interview</div>
          <h1 className="land-h1">
            Questions From<br />
            <span className='land-h1-em'>Your Resume.</span><br />
            Nothing Else.
          </h1>
          <p className="land-p">
            Upload your resume and the AI reads every project, skill, and experience — then builds
            5 unique questions to test your real knowledge. No generic interview prep. Every question
            is about <em>you</em>.
          </p>

          <div className="land-how">
            <div className="lhow-step">
              <div className="lhow-n">01</div>
              <div>
                <strong>Upload Your Resume</strong>
                <p>AI analyses your skills, projects, and experience</p>
              </div>
            </div>
            <div className='lhow-step'>
              <div className='lhow-n'>02</div>
              <div>
                <strong>Preview Your 5 Questions</strong>
                <p>Each from a different area of your background</p>
              </div>
            </div>
            <div className="lhow-step">
              <div className="lhow-n">03</div>
              <div>
                <strong>Live Interview with Follow-ups</strong>
                <p>AI probes your answers, scored 80% knowledge + 20% confidence</p>
              </div>
            </div>
          </div>

          <div className="land-chips">
            <span>🔊 Audio Questions</span>
            <span>🧩 5 Unique Resume Topics</span>
            <span>🧠 Live Follow-ups</span>
            <span>📊 Deep Scoring</span>
            <span>📄 PDF Report</span>
          </div>
        </div>

        <div className='land-right'>
          <div className='land-card'>
            <div className='lc-section'>
              <p className='lc-label'>Experience Level</p>
              <div className="lc-levels">
                {LEVELS.map(l => (
                  <button
                    key={l.id}
                    className={`lcl-btn ${level === l.id ? 'sel' : ''}`}
                    onClick={() => setLevel(l.id)}
                  >
                    <span className="lcl-icon">{l.icon}</span>
                    <div className='lcl-text'>
                      <strong>{l.label}</strong>
                      <span>{l.desc}</span>
                    </div>
                    {level === l.id && <span className="lcl-check">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="lc-row">
              <div className="lc-section half">
                <p className="lc-label">Interview Type</p>
                <div className='lc-opts'>
                  {['Technical', 'HR', 'Behavioral'].map(t => (
                    <button key={t}
                      className={`lco-btn ${interviewType === t ? 'sel' : ''}`}
                      onClick={() => setInterviewType(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="lc-section half">
                <p className="lc-label">Difficulty</p>
                <div className='lc-opts'>
                  {['Easy', 'Medium', 'Hard'].map(d => (
                    <button key={d}
                      className={`lco-btn d-${d.toLowerCase()} ${difficulty === d ? 'sel' : ''}`}
                      onClick={() => setDifficulty(d)}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className='lc-section'>
              <p className='lc-label'>Resume</p>
              <label className="lc-upload" htmlFor="ru">{uploadLabel()}</label>
              <input id='ru' type='file' accept='.docx' onChange={handleFileUpload} style={
    { display: 'none' }} />
            </div>

            <button
              className={`lc-cta ${uploadStatus === 'ready' && !isAnalysing ? '' : 'disabled'}`}
              onClick={analyseResume}
            >
              {isAnalysing
                ? <><span className='spin'>↻</span> Analysing Resume...</>
                : uploadStatus === 'ready'
                  ? `Analyse & Build Questions →`
                  : 'Upload Resume to Continue'}
            </button>

            {isAnalysing && (
              <p className="lc-analysing-note">
                AI is reading your resume and building personalised questions...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}