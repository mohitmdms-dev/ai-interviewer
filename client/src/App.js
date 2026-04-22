import './App.css';

import axios from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';

const TOTAL_Q = 5;
const TIMER = 240;
const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const STORE_KEY = 'practiceroom_sessions';

const GD_TOPICS = [
  'Artificial Intelligence will create more jobs than it destroys',
  'Remote work is more productive than working from the office',
  'Social media does more harm than good to society',
  'Should coding be mandatory in school curriculum?',
  'Is a college degree still necessary for a successful career in tech?',
  'Climate change should be the top priority over economic growth',
  'Cryptocurrency will replace traditional banking in 10 years',
  'Work-life balance is a myth in the modern corporate world',
  'India should prioritize deep tech over outsourcing services',
  'Startups are better career choices than established corporations for freshers',
];

const GD_PERSONAS = [
  [
    {
      name: 'Arjun',
      stance: 'strongly supports',
      style: 'data-driven, cites stats and real examples, confident tone'
    },
    {
      name: 'Priya',
      stance: 'firmly opposes',
      style:
          'emotional and passionate, appeals to human impact, challenges assumptions'
    },
    {
      name: 'Rohan',
      stance: 'plays devil\'s advocate on',
      style: 'sceptical, pokes holes in arguments, asks tough questions'
    },
  ],
  [
    {
      name: 'Meera',
      stance: 'passionately supports',
      style: 'visionary, talks about future implications, uses analogies'
    },
    {
      name: 'Karan',
      stance: 'critically questions',
      style:
          'logical and structured, breaks arguments into parts, highlights contradictions'
    },
    {
      name: 'Ananya',
      stance: 'seeks a middle ground on',
      style: 'diplomatic, synthesises opposing views, steers toward consensus'
    },
  ],
  [
    {
      name: 'Vikram',
      stance: 'strongly opposes',
      style:
          'blunt and direct, uses provocative statements, challenges the group'
    },
    {
      name: 'Divya',
      stance: 'enthusiastically supports',
      style: 'energetic, uses current events and news, builds momentum'
    },
    {
      name: 'Rahul',
      stance: 'raises practical concerns about',
      style: 'pragmatic, focuses on feasibility and implementation challenges'
    },
  ],
];

const FILLERS = [
  'um',        'uh',           'er',      'ah',        'like',
  'basically', 'you know',     'sort of', 'kind of',   'right',
  'okay so',   'so basically', 'i mean',  'literally', 'actually',
  'honestly',  'obviously',    'clearly', 'just',      'anyway'
];
const P_COLORS = ['#5b9dff', '#6c63ff', '#2ecc71'];

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const pct = (s, m) => Math.round((s / m) * 100);
const sClass = p => p >= 70 ? 'hi' : p >= 50 ? 'md' : 'lo';
const fmtTime = t => Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
const tColor = t => t > 120 ? 'var(--acc)' : t > 60 ? '#f0a030' : '#e05555';
const msg = (role, content) => ({role, content, ts: new Date()});
const getRef = r => r.current ? r.current.textContent : '';

function detectFillers(text) {
  if (!text) return {count: 0, words: ''};
  const found = {};
  FILLERS.forEach(f => {
    const m = text.toLowerCase().match(
        new RegExp('\\b' + f.replace(' ', '\\s+') + '\\b', 'gi'));
    if (m && m.length) found[f] = m.length;
  });
  return {
    count: Object.values(found).reduce((a, b) => a + b, 0),
    words: Object.entries(found).map(([k, v]) => k + ' x' + v).join(', '),
  };
}

const DB = {
  load: () => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    } catch {
      return [];
    }
  },
  save: s => {
    try {
      localStorage.setItem(
          STORE_KEY, JSON.stringify([s, ...DB.load()].slice(0, 20)));
    } catch {
    }
  },
  del: id => {
    try {
      localStorage.setItem(
          STORE_KEY, JSON.stringify(DB.load().filter(s => s.id !== id)));
    } catch {
    }
  },
  fmt: iso => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(
                 'en-IN', {day: 'numeric', month: 'short', year: 'numeric'}) +
          ' ' +
          d.toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'});
    } catch {
      return iso;
    }
  },
};

function pickVoice() {
  const vs = window.speechSynthesis.getVoices();
  return vs.find(v => v.name === 'Google UK English Female') ||
      vs.find(v => v.name === 'Google US English Female') ||
      vs.find(v => /samantha/i.test(v.name)) ||
      vs.find(v => /female/i.test(v.name) && v.lang.startsWith('en')) ||
      vs.find(v => v.lang.startsWith('en')) || null;
}

function speakNatural(text, onDone) {
  const s = window.speechSynthesis;
  if (!s) {
    onDone?.();
    return;
  }
  s.cancel();
  const clean = text.replace(/[*_`#>~[\]{}]/g, '')
                    .replace(/https?:\/\/\S+/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
  if (!clean) {
    onDone?.();
    return;
  }
  const chunks = (clean.match(/[^.!?;:]+[.!?;:]+|[^.!?;:]+$/g) || [clean])
                     .map(c => c.trim())
                     .filter(c => c.length > 1);
  const voice = pickVoice();
  let i = 0, done = false, kat = null;
  const finish = () => {
    if (!done) {
      done = true;
      clearTimeout(kat);
      onDone?.();
    }
  };
  const keepAlive = () => {
    if (!done && s.speaking) {
      s.pause();
      s.resume();
      kat = setTimeout(keepAlive, 10000);
    }
  };
  const next = () => {
    if (done) return;
    if (i >= chunks.length) {
      finish();
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks[i++]);
    if (voice) u.voice = voice;
    u.rate = 0.92;
    u.pitch = 1;
    u.volume = 1;
    u.onend = () => {
      clearTimeout(kat);
      setTimeout(next, 80);
    };
    u.onerror = e => {
      clearTimeout(kat);
      if (e.error === 'interrupted' || e.error === 'canceled') {
        finish();
        return;
      }
      setTimeout(next, 80);
    };
    s.speak(u);
    kat = setTimeout(keepAlive, 10000);
  };
  next();
}

const speakAsync = text => new Promise(resolve => speakNatural(text, resolve));

function useContinuousVoice(onText) {
  const active = useRef(false), rec = useRef(null), committed = useRef('');
  const retryT = useRef(null), langIdx = useRef(0), lastFinal = useRef(''),
        cb = useRef(onText);
  useEffect(() => {
    cb.current = onText;
  }, [onText]);
  const clean = t =>
      t.replace(/\s+/g, ' ')
          .replace(/^[,.\s]+/, '')
          .replace(/\bi\b/g, 'I')
          .replace(/(\. )([a-z])/g, (_, d, c) => d + c.toUpperCase())
          .trim();
  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Voice requires Chrome or Edge.');
      return;
    }
    active.current = true;
    committed.current = '';
    lastFinal.current = '';
    langIdx.current = 0;
    clearTimeout(retryT.current);
    const boot = () => {
      if (!active.current) return;
      try {
        const r = new SR();
        rec.current = r;
        r.lang = ['en-IN', 'en-GB', 'en-US'][langIdx.current % 3];
        r.continuous = true;
        r.interimResults = true;
        r.maxAlternatives = 3;
        r.onresult = e => {
          let finals = '', interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) {
              const best = Array.from(res).reduce(
                  (a, b) =>
                      (b.confidence || 0.5) > (a.confidence || 0.5) ? b : a);
              if ((best.confidence === 0 || best.confidence > 0.08) &&
                  best.transcript.trim() !== lastFinal.current.trim()) {
                finals += best.transcript + ' ';
                lastFinal.current = best.transcript.trim();
              }
            } else {
              interim += res[0].transcript;
            }
          }
          if (finals)
            committed.current = clean(committed.current + ' ' + finals);
          cb.current(clean(committed.current + (interim ? ' ' + interim : '')));
        };
        r.onend = () => {
          if (active.current) retryT.current = setTimeout(boot, 100);
        };
        r.onerror = ev => {
          if (!active.current || ev.error === 'aborted') return;
          if (ev.error === 'not-allowed') {
            alert('Microphone denied.');
            active.current = false;
            return;
          }
          if (ev.error === 'no-speech') langIdx.current++;
          retryT.current = setTimeout(boot, ev.error === 'network' ? 600 : 180);
        };
        r.start();
      } catch {
        retryT.current = setTimeout(boot, 300);
      }
    };
    boot();
  }, []);
  const stop = useCallback(() => {
    active.current = false;
    clearTimeout(retryT.current);
    try {
      if (rec.current) {
        rec.current.onend = rec.current.onerror = rec.current.onresult = null;
        rec.current.stop();
      }
    } catch {
    }
    const r = committed.current.trim();
    committed.current = '';
    lastFinal.current = '';
    return r;
  }, []);
  return {start, stop};
}

function useCountdown(active, timeLeft, setTimeLeft, onExpire) {
  const timerRef = useRef(null);
  useEffect(() => {
    if (active && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    } else if (active && timeLeft === 0) {
      onExpire();
    }
    return () => clearTimeout(timerRef.current);
  }, [active, timeLeft]);
}

function VoiceInput({
  editRef,
  tx,
  setTx,
  listening,
  setListening,
  voice,
  onSubmit,
  disabled,
  label = 'Submit',
  speaking = false,
  onInterrupt
}) {
  const hasAns = (getRef(editRef) || tx).trim().length > 0;
  const startRec = () => {
    setTx('');
    if (editRef.current) editRef.current.textContent = '';
    setListening(true);
    voice.start();
  };
  const stopRec = () => {
    voice.stop();
    setListening(false);
  };
  const clear = () => {
    voice.stop();
    setListening(false);
    setTx('');
    if (editRef.current) editRef.current.textContent = '';
  };
  return (
    <div className='iv-input'>
      {speaking && !listening && (
        <div className='speak-bar interrupt-bar'>
          <div className='speak-waves'>{[0,1,2,3,4].map(i => <span key={
    i} />)}</div>
          <div className='speak-bar-left'><span className='speak-lbl'>Speaking</span><span className="speak-hint">Interrupt anytime</span></div>
          <div className="speak-bar-btns">
            <button className="btn-interrupt" onClick={onInterrupt}><span className="rec-dot" />Answer Now</button>
            <button className="speak-stop" onClick={() => window.speechSynthesis?.cancel()}>Skip</button>
          </div>
        </div>
      )}
      {(!speaking || listening) && (
        <div className={'voice-wrap' + (listening ? ' rec' : '')}>
          <div ref={editRef} className='voice-field' contentEditable={!listening} suppressContentEditableWarning
    onInput = {e => setTx(e.currentTarget.textContent)} onPaste =
        {e => e.preventDefault()} onCopy = {e => e.preventDefault()} onCut =
            {e => e.preventDefault()} onDrop =
                {e => e.preventDefault()} onContextMenu =
                    {e => e.preventDefault()} spellCheck =
    {
      false
    } />
          <div className="voice-bar">
            {!listening
              ? <button className={'btn-rec' + (disabled ? ' off' : '')} onClick={disabled ? undefined : startRec}><span className="rec-dot" / >
        {hasAns ? 'Continue' : 'Record'} <
        /button>
              : <button className="btn-rec on" onClick={stopRec}><span className="rec-dot" / >
        Stop<
            /button>
            }
            {hasAns && !listening && <button className="btn-action" onClick={clear}>Clear</button>}
            {
    hasAns &&!listening
            &&<button className =
                   {'btn-action primary' + (disabled ? ' off' : '')} onClick =
                       {disabled ? undefined : onSubmit}>{label} <
        /button>}
          </div >
        </div>
      )}
      <p className="input-hint">
        {speaking && !listening ? 'Press Answer Now to interrupt'
          : listening ? 'Recording - press Stop when finished'
          : hasAns ? 'Edit if needed, then ' + label
          : disabled ? 'Please wait...'
          : 'Press Record to start'}
      </p>
        </div>
  );
}

function ScoreCard({ data, metrics, onNext, nextLabel, title }) {
  const p = pct(data.totalScore, 10);
  return (
    <div className="iv-fb">
      {title && <p className="gd-result-label">{title}</p>}
      {data.aiDetected && <p className='fb-ai'>{data.aiFlagReason}</p>}
      <div className="fb-row">
        <div className="fb-score">
          <span className={'fb-num ' + sClass(p * 10)}>{data.totalScore}</span>
          <span className='fb-denom'>/10</span>
        </div>
        <div className="fb-metrics">
          {metrics.map(([l, v]) => (
            <div key={l} className="fb-metric">
              <span>{l}</span>
              <div className='fb-bar'><div className='fb-fill' style={
    { width: v * 10 + '%' }} /></div>
              <span className='fb-val'>{v}</span>
            </div>
          ))}
        </div>
      </div>
      {data.fillerCount > 0 && (
        <div className={'fb-filler' + (data.fillerCount >= 5 ? ' hi' : '')}>
          <span className='fb-filler-icon'>!</span>
          <span className="fb-filler-text">{data.fillerCount} filler{data.fillerCount !== 1 ? 's' : ''}: {data.fillerWords}</span>
        </div>
      )}
      <div className="fb-text">
        <p className="fb-main">{data.feedback}</p>
        {data.strengths && <p className='fb-good'>{data.strengths}</p>}
        {data.improvement && <p className="fb-tip">{data.improvement}</p>}
      </div>
      {data.resources?.length > 0 && (
        <div className="fb-links">
          {data.resources.map((r, i) => <a key={i} href={r.url} target="_blank" rel="noreferrer">{r.title}</a>)}
        </div>
      )}
      {onNext && <button className="fb-next" onClick={onNext}>{nextLabel}</button>}
    </div>
  );
}

function MsgList({ list, label, typing, endRef }) {
  return (
    <div className="iv-msgs">
      {list.length === 0 && <div className="msgs-empty"><div className="msgs-pulse" /></div>}
      {list.map((m, i) => m.role === 'sys'
        ? <div key={i} className="msg sys"><span className="msg-sys-text">{m.content}</span></div>
        : (
          <div key={i} className={'msg' + (m.role === 'you' ? ' you' : '')}>
            <div className="msg-av">{m.role === 'you' ? 'You' : label}</div>
            <div className='msg-body'>
              <p className='msg-text'>{m.content}</p>
              <p className="msg-ts">{m.ts.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</p>
            </div>
          </div>
        )
      )
}
      {typing && <div className='typing-row'><div className='typing-av'>{label}</div><div className="typing-bubble"><span /><span /><span /></div></div>}
      <div ref={endRef} />
    </div>
  );
      }

      function ResourceGrid({resources}) {
        if (!resources?.length) return null;
  return (
    <div className='res-prep-grid'>
      {resources.map((r, i) => {
    let domain = '';
    try {
      domain = new URL(r.url).hostname.replace('www.', '');
    } catch {
    }
    const tag = domain.includes('youtube')                      ? 'Video' :
        domain.includes('github')                               ? 'Code' :
        domain.includes('medium')                               ? 'Article' :
        domain.includes('docs.')                                ? 'Docs' :
        domain.includes('coursera') || domain.includes('udemy') ? 'Course' :
                                                                  'Read';
    const color = tag === 'Video' ? '#e05555' :
        tag === 'Code'            ? '#2ecc71' :
        tag === 'Course'          ? '#6c63ff' :
        tag === 'Docs'            ? '#f0a030' :
                                    'var(--acc)';
    return (
        <a key = {i} href = {r.url} target = '_blank' rel =
             'noreferrer' className = 'res-prep-card'>
        <div className = 'res-prep-card-top'>
        <span className = 'res-prep-tag' style = {
          {
            background: color + '22', color, borderColor: color + '44'
          }
        }>{tag} <
        /span>
              <span className="res-prep-domain">{domain}</span >
        </div>
            <p className="res-prep-card-title">{r.title}</p>
        <p className = 'res-prep-card-reason'>{r.reason} <
        /p>
            <div className="res-prep-card-foot"><span className="res-prep-card-cta">Open resource &#8599;</span >
        </div>
          </a>);
      })}
    </div>
  );
}

function ScorePills({ items, color }) {
  return (
    <div className="res-q-head" style={{ flexWrap:'wrap', gap:'8px' }}>
      {items.map(([l, v]) => (
        <div key={l} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', padding:'8px 12px', background:'var(--bg3)', borderRadius:'8px', border:'1px solid var(--border)' }}>
          <span style={{ fontSize:'18px', fontWeight:700, color }}>{v}</span>
          <span style={{
    fontSize: '10px', color: 'var(--ink3)' }}>{l}</span>
        </div>
      ))
      }
      < /div>
  );
}

function HistoryScreen({ onClose }) {
  const [list, setList] = useState(() => DB.load());
  const [view, setView] = useState(null);
  const modeLabel = s => s.mode === 'interview' ? s.itype + ' /' + s.diff : s.mode === ' gd
      ' ? ' Group Discussion / ' + s.diff : ' Stress Interview / ' + s.diff;

          if (view) {
        const p = pct(view.totalScore, view.maxScore);
    return (
      <div className='results'><div className='res-inner'>
        <div className='res-header a0' style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p className='res-eyebrow'>{modeLabel(view)} &bull; {DB.fmt(view.date)}</p>
            <h1 className="res-title">Session Review</h1>
          </div>
          <button className="hist-close" onClick={() => setView(null)} style={{ marginTop:'8px' }}>&#10005;</button>
        </div>
        <div className="res-score a1">
          <span className="res-big">{view.totalScore}</span>
          <span className='res-denom'>/{view.maxScore}</span>
          <span className={'res-verdict ' + sClass(p)}>{p >= 85 ? 'Outstanding.' : p >= 70 ? 'Strong.' : p >= 50 ? 'Room to grow.' : 'Needs work.'}</span>
        </div>
        <div className='res-qs a2'>
          {view.mode === 'interview' && view.questions?.map((q, i) => (
            <div key={i} className='res-q'>
              <div className='res-q-head'>
                <div className='res-q-left'><div className='res-q-n'>{i + 1}</div><span className="res-q-area">{q.area}</span></div>
                <div className="res-q-scores"><span>K{q.knowledgeScore}</span><span>C{q.confidenceScore}</span><span className="res-q-total">{q.totalScore}/10</span></div>
              </div>
              {q.feedback && <p className="res-q-fb">{q.feedback}</p>}
              {
    q.strengths &&<p className = 'fb-good' style = {
      {
        fontSize: '13px', margin: '4px 0'
      }
    }>{q.strengths} <
        /p>}
              {q.improvement && <p className="res-q-tip">{q.improvement}</p >}
              {q.fillerCount > 0 && <p style={{
      fontSize: '12px', color: 'var(--muted)', margin: '4px 0' }}>Fillers: {q.fillerCount} ({q.fillerWords})</p>}
            </div>
          ))}
          {view.mode === 'gd' && view.result && (
            <div className='res-q'>
              {
      view.topic &&<p style = {
        {
          fontSize: '13px', color: 'var(--ink2)', marginBottom: '12px'
        }
      }>Topic: {view.topic} <
          /p>}
              <ScorePills color="var(--acc)" items={[['Initiation', view.result.initiationScore], ['Content', view.result.contentScore], ['Leadership', view.result.leadershipScore], ['Communication', view.result.communicationScore]]} / >
          {
            view.result.feedback &&<p className = 'res-q-fb'>{
                view.result.feedback} <
            /p>}
              {view.result.strengths && <p className="fb-good" style={{ fontSize:'13px', margin:'4px 0' }}>{view.result.strengths}</p >
          } {view.result.improvement && <p className='res-q-tip'>{view.result.improvement}</p>}
            </div>
          )
      }
      {view.mode === 'stress' && view.result && (
            <div className='res-q'>
              <ScorePills color='#e05555' items={
          [['Composure', view.result.composureScore],
           ['Assertiveness', view.result.assertivenessScore],
           ['Recovery', view.result.recoveryScore],
           ['Authenticity', view.result.authenticityScore]]} />
              {view.result.feedback && <p className="res-q-fb">{view.result.feedback}</p>
      }
              {view.result.strengths && <p className='fb-good' style={{
        fontSize: '13px', margin: '4px 0' }}>{view.result.strengths}</p>}
              {view.result.improvement && <p className="res-q-tip">{view.result.improvement}</p>}
            </div>
          )}
        </div>
        <div className='res-actions a3'><button className='res-ghost' onClick={() => setView(null)}>Back to History</button></div>
      </div></div>
    );
  }

  return (
    <div className='results'><div className='res-inner'>
      <div className='res-header a0' style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className='res-title'>History</h1>
        <button className="res-ghost" onClick={onClose}>Back to Home</button>
      </div>
      {list.length === 0
        ? <p style={{ color:'var(--muted)', textAlign:'center', marginTop:'40px' }}>No sessions yet. Complete any mode to see history.</p>
        : (
          <div className='res-qs a1'>
            {
      list.map(s => {
        const p = pct(s.totalScore, s.maxScore);
        return (
            <div key = {s.id} className =
                 'hist-item' onClick = {() => setView(s)} style = {
                   {
                     cursor: 'pointer', padding: '14px 16px',
                         borderRadius: '10px', background: 'var(--surface)',
                         border: '1px solid var(--border)',
                         marginBottom: '10px', display: 'flex',
                         alignItems: 'center', gap: '12px'
                   }
                 }><div style = {
              {
                flex: 1
              }
            }><div style = {
              {
                fontWeight: 600, fontSize: '14px', marginBottom: '4px'
              }
            }>{modeLabel(s)} <
            /div>
                    <div style={{ fontSize:'12px', color:'var(--muted)' }}>{DB.fmt(s.date)}</div >
            </div>
                  <span className={'hist-score ' + sClass(p)} style={{ fontSize:'16px', fontWeight:700 }}>{s.totalScore}/{
                 s.maxScore} <
             /span>
                  <button className="hist-del" onClick={e => { e.stopPropagation(); DB.del(s.id); setList(DB.load()); }}>&#10005;</button>
            </div>
              );
            })}
          </div>)
      } < /div></div >);
}

export default function App() {
      const [screen, setScreen] = useState('landing');
      const [itype, setItype] = useState('Technical');
      const [diff, setDiff] = useState('Medium');
      const [upState, setUpState] = useState('idle');
      const [plans, setPlans] = useState([]);
      const [analysing, setAnalysing] = useState(false);
      const [step, setStep] = useState(0);
      const [msgs, setMsgs] = useState([]);
      const [tx, setTx] = useState('');
      const [started, setStarted] = useState(false);
      const [feedback, setFeedback] = useState(null);
      const [aiTyping, setAiTyping] = useState(false);
      const [history, setHistory] = useState([]);
      const [tLeft, setTLeft] = useState(TIMER);
      const [timerOn, setTimerOn] = useState(false);
      const [listening, setListening] = useState(false);
      const [audioOn, setAudioOn] = useState(true);
      const [speaking, setSpeaking] = useState(false);
      const [sid] = useState(uid);

      const [gdMode, setGdMode] = useState('interview');
      const [gdTopic, setGdTopic] = useState(GD_TOPICS[0]);
      const [gdCustom, setGdCustom] = useState(false);
      const [gdCustomT, setGdCustomT] = useState('');
      const [gdMsgs, setGdMsgs] = useState([]);
      const [gdResult, setGdResult] = useState(null);
      const [gdTyping, setGdTyping] = useState(false);
      const [gdTLeft, setGdTLeft] = useState(TIMER);
      const [gdTimerOn, setGdTimerOn] = useState(false);
      const [gdDone, setGdDone] = useState(false);
      const [gdSpk, setGdSpk] = useState(false);
      const [gdSpeaker, setGdSpeaker] = useState('');

      const [sMsgs, setSMsgs] = useState([]);
      const [sRes, setSRes] = useState(null);
      const [sTyping, setSTyping] = useState(false);
      const [sTLeft, setSTLeft] = useState(TIMER);
      const [sTimerOn, setSTimerOn] = useState(false);
      const [sDone, setSDone] = useState(false);
      const [sSpk, setSSpk] = useState(false);

      const [suggestions, setSuggestions] = useState([]);
      const [suggestLoading, setSuggestLoading] = useState(false);

      const audioR = useRef(true);
      const pendingR = useRef(false);
      const savedR = useRef(false);
      const endR = useRef(null), gdEndR = useRef(null), sEndR = useRef(null);
      const editR = useRef(null), gdEditR = useRef(null), sEditR = useRef(null);
      const plansR = useRef([]), stepR = useRef(0);
      const cvR = useRef([]), gdCvR = useRef([]), sCvR = useRef([]);
      const gdSidR = useRef(''), sSidR = useRef(''), gdPersR = useRef([]);
      const fillerR = useRef({count: 0, words: ''});
      const historyR = useRef([]);

      useEffect(() => {
        audioR.current = audioOn;
      }, [audioOn]);
      useEffect(() => {
        plansR.current = plans;
      }, [plans]);
      useEffect(() => {
        stepR.current = step;
      }, [step]);
      useEffect(() => {
        historyR.current = history;
      }, [history]);

      useEffect(() => {
        endR.current?.scrollIntoView({behavior: 'smooth'});
      }, [msgs, aiTyping]);
      useEffect(() => {
        gdEndR.current?.scrollIntoView({behavior: 'smooth'});
      }, [gdMsgs, gdTyping]);
      useEffect(() => {
        sEndR.current?.scrollIntoView({behavior: 'smooth'});
      }, [sMsgs, sTyping]);

      useEffect(() => {
        const s = window.speechSynthesis;
        if (!s) return;
        const load = () => {
          if (!s.getVoices().length) setTimeout(load, 100);
        };
        load();
        s.addEventListener('voiceschanged', () => s.getVoices());
      }, []);

      useCountdown(timerOn, tLeft, setTLeft, useCallback(() => {
                     setTimerOn(false);
                     addMsg('sys', 'Time up.');
                     doGrade();
                   }, []));
      useCountdown(gdTimerOn, gdTLeft, setGdTLeft, useCallback(() => {
                     setGdTimerOn(false);
                     doGdGrade();
                   }, []));
      useCountdown(sTimerOn, sTLeft, setSTLeft, useCallback(() => {
                     setSTimerOn(false);
                     doStressGrade();
                   }, []));

      const addMsg = useCallback((r, c) => setMsgs(p => [...p, msg(r, c)]), []);
      const addGdMsg =
          useCallback((r, c) => setGdMsgs(p => [...p, msg(r, c)]), []);
      const addSMsg =
          useCallback((r, c) => setSMsgs(p => [...p, msg(r, c)]), []);

      const stopAll = useCallback(() => {
        window.speechSynthesis?.cancel();
        setSpeaking(false);
        setGdSpk(false);
        setSSpk(false);
      }, []);

      const speak = useCallback((text, onDone) => {
        if (!audioR.current) {
          onDone?.();
          return;
        }
        setSpeaking(true);
        speakNatural(text, () => {
          setSpeaking(false);
          onDone?.();
        });
      }, []);

      const saveInterview = useCallback((questions, it, df) => {
        DB.save({
          id: uid(),
          date: new Date().toISOString(),
          mode: 'interview',
          itype: it,
          diff: df,
          totalScore: questions.reduce((a, b) => a + (b.totalScore || 0), 0),
          maxScore: TOTAL_Q * 10,
          questions
        });
      }, []);

      const onTx = useCallback(t => {
        setTx(t);
        if (editR.current && editR.current.textContent !== t)
          editR.current.textContent = t;
      }, []);
      const onGdTx = useCallback(t => {
        setTx(t);
        if (gdEditR.current && gdEditR.current.textContent !== t)
          gdEditR.current.textContent = t;
      }, []);
      const onSTx = useCallback(t => {
        setTx(t);
        if (sEditR.current && sEditR.current.textContent !== t)
          sEditR.current.textContent = t;
      }, []);

      const voice = useContinuousVoice(onTx);
      const gdVoice = useContinuousVoice(onGdTx);
      const sVoice = useContinuousVoice(onSTx);

      useEffect(() => {
        if (screen !== 'results') return;
        if (history.flatMap(h => h.resources || []).length > 0) return;
        const areas =
            history.map(h => h.area).filter(a => a && a !== 'Skipped');
        if (!areas.length) return;
        setSuggestLoading(true);
        setSuggestions([]);
        axios
            .post(
                BASE + '/suggest-resources',
                {areas, type: itype, difficulty: diff})
            .then(r => setSuggestions(r.data.resources || []))
            .catch(() => {})
            .finally(() => setSuggestLoading(false));
      }, [screen]);

      const doGrade = useCallback(async () => {
        setTimerOn(false);
        stopAll();
        pendingR.current = false;
        addMsg('sys', 'Evaluating your answer...');
        const s = stepR.current;
        const pl = plansR.current[s - 1];
        const fd = {...fillerR.current};
        fillerR.current = {count: 0, words: ''};
        try {
          const res = await axios.post(BASE + '/grade', {
            conversation: cvR.current.slice(),
            questionNumber: s,
            type: itype,
            difficulty: diff,
            area: pl?.area || '',
            angle: pl?.angle || '',
            fillerCount: fd.count,
            fillerWords: fd.words,
          });
          setFeedback(res.data.data);
          const updated = [
            ...historyR.current, {
              questionNumber: s,
              area: pl?.area || '',
              angle: pl?.angle || '',
              ...res.data.data
            }
          ];
          setHistory(updated);
          if (s === TOTAL_Q && !savedR.current) {
            savedR.current = true;
            saveInterview(updated, itype, diff);
          }
        } catch {
          addMsg('sys', 'Error grading.');
        }
      }, [itype, diff, addMsg, stopAll, saveInterview]);

      const loadQ = useCallback(async (s, ps) => {
        const pl = ps[s - 1];
        pendingR.current = false;
        stopAll();
        setMsgs([]);
        setFeedback(null);
        setStarted(false);
        cvR.current = [];
        setTimerOn(false);
        setTLeft(TIMER);
        setTx('');
        setListening(false);
        if (editR.current) editR.current.textContent = '';
        setAiTyping(true);
        try {
          const res = await axios.post(BASE + '/start-question', {
            questionNumber: s,
            type: itype,
            difficulty: diff,
            area: pl.area,
            angle: pl.angle,
            sessionId: sid + '-q' + s
          });
          setAiTyping(false);
          addMsg('ai', res.data.message);
          cvR.current = [{role: 'assistant', content: res.data.message}];
          setStarted(true);
          setTimerOn(true);
          speak(res.data.message);
        } catch {
          setAiTyping(false);
          addMsg('sys', 'Connection error.');
        }
      }, [itype, diff, sid, addMsg, speak, stopAll]);

      const submitAnswer = useCallback(async () => {
        const raw = (getRef(editR) || tx).trim();
        if (!raw || aiTyping) return;
        voice.stop();
        stopAll();
        pendingR.current = false;
        const fd = detectFillers(raw);
        fillerR.current = {
          count: fillerR.current.count + fd.count,
          words: [fillerR.current.words, fd.words].filter(Boolean).join(', ')
        };
        setTx('');
        if (editR.current) editR.current.textContent = '';
        addMsg('you', raw);
        cvR.current = [...cvR.current, {role: 'user', content: raw}];
        setAiTyping(true);
        try {
          const res = await axios.post(
              BASE + '/chat',
              {message: raw, sessionId: sid + '-q' + stepR.current});
          setAiTyping(false);
          if (res.data.message) {
            addMsg('ai', res.data.message);
            cvR.current = [
              ...cvR.current, {role: 'assistant', content: res.data.message}
            ];
            if (res.data.isComplete) {
              pendingR.current = true;
              speak(res.data.message, () => {
                if (pendingR.current) {
                  pendingR.current = false;
                  doGrade();
                }
              });
            } else
              speak(res.data.message);
          }
        } catch {
          setAiTyping(false);
          addMsg('sys', 'Connection error.');
        }
      }, [tx, aiTyping, voice, addMsg, sid, speak, stopAll, doGrade]);

      const goNext = useCallback(() => {
        stopAll();
        pendingR.current = false;
        if (step < TOTAL_Q) {
          const n = step + 1;
          setStep(n);
          stepR.current = n;
          loadQ(n, plansR.current);
        } else
          setScreen('results');
      }, [step, loadQ, stopAll]);

      const skip = useCallback(() => {
        stopAll();
        pendingR.current = false;
        voice.stop();
        setListening(false);
        const pl = plansR.current[step - 1];
        const skipped = {
          questionNumber: step,
          area: pl?.area || 'Skipped',
          angle: '',
          totalScore: 0,
          knowledgeScore: 0,
          confidenceScore: 0,
          accuracy: 0,
          depth: 0,
          problemSolving: 0,
          resumeAlignment: 0,
          aiDetected: false,
          aiFlagReason: '',
          feedback: 'Skipped.',
          strengths: '',
          improvement: 'Attempt every question.',
          resources: []
        };
        const updated = [...historyR.current, skipped];
        setHistory(updated);
        if (step === TOTAL_Q && !savedR.current) {
          savedR.current = true;
          saveInterview(updated, itype, diff);
        }
        if (step < TOTAL_Q) {
          const n = step + 1;
          setStep(n);
          stepR.current = n;
          loadQ(n, plansR.current);
        } else
          setScreen('results');
      }, [step, voice, loadQ, stopAll, itype, diff, saveInterview]);

      const restart = useCallback(() => {
        stopAll();
        setHistory([]);
        setStep(0);
        setFeedback(null);
        setMsgs([]);
        setTx('');
        setPlans([]);
        setUpState('idle');
        pendingR.current = false;
        savedR.current = false;
        setScreen('landing');
      }, [stopAll]);

      const parseGdLines = useCallback((raw, personas) => {
        const results = raw.split(/\n+/)
                            .map(l => l.trim())
                            .filter(Boolean)
                            .filter(l => !l.startsWith('GD_COMPLETE'))
                            .map(l => {
                              const ci = l.indexOf(':');
                              return ci > -1 && ci < 15 ? {
                                name: l.slice(0, ci).trim(),
                                text: l.slice(ci + 1).trim()
                              } :
                                                          null;
                            })
                            .filter(l => l && l.text.length > 1);
        return results.length > 0 ? results : [{
          name: personas[0]?.name || 'Panel',
          text: raw.split('GD_COMPLETE')[0].trim()
        }];
      }, []);

      const playGdSequence = useCallback(async (lines) => {
        const fullText = lines.map(l => l.name + ': ' + l.text).join('\n');
        gdCvR.current =
            [...gdCvR.current, {role: 'assistant', content: fullText}];
        setGdTimerOn(true);
        for (const line of lines) {
          addGdMsg('panel', line.name + ': ' + line.text);
          if (audioR.current) {
            setGdSpk(true);
            setGdSpeaker(line.name);
            await speakAsync(line.text);
            setGdSpk(false);
            setGdSpeaker('');
            await new Promise(r => setTimeout(r, 350));
          }
        }
      }, [addGdMsg]);

      const startGd = useCallback(
          async () => {
            const topic =
                gdCustom && gdCustomT.trim() ? gdCustomT.trim() : gdTopic;
            const personas = GD_PERSONAS[Math.floor(Math.random() * 3)];
            const newSid = uid();
            gdSidR.current = newSid;
            gdPersR.current = personas;
            gdCvR.current = [];
            setGdMsgs([]);
            setGdResult(null);
            setGdDone(false);
            setGdTLeft(TIMER);
            setGdTyping(true);
            setScreen('gd');
            try {
              const res = await axios.post(
                  BASE + '/gd-start', {topic, sessionId: newSid, personas});
              setGdTyping(false);
              await playGdSequence(parseGdLines(res.data.message, personas));
            } catch {
              setGdTyping(false);
              addGdMsg('sys', 'Connection error.');
            }
          },
          [
            gdCustom, gdCustomT, gdTopic, addGdMsg, parseGdLines, playGdSequence
          ]);

      const submitGd = useCallback(
          async () => {
            const raw = (getRef(gdEditR) || tx).trim();
            if (!raw || gdTyping || gdDone) return;
            gdVoice.stop();
            setListening(false);
            setTx('');
            if (gdEditR.current) gdEditR.current.textContent = '';
            addGdMsg('you', raw);
            gdCvR.current = [...gdCvR.current, {role: 'user', content: raw}];
            setGdTyping(true);
            try {
              const res = await axios.post(
                  BASE + '/gd-chat', {message: raw, sessionId: gdSidR.current});
              setGdTyping(false);
              if (res.data.message) {
                await playGdSequence(
                    parseGdLines(res.data.message, gdPersR.current));
                if (res.data.isComplete) {
                  setGdTimerOn(false);
                  setGdDone(true);
                  doGdGrade();
                }
              }
            } catch {
              setGdTyping(false);
              addGdMsg('sys', 'Connection error.');
            }
          },
          [
            tx, gdTyping, gdDone, addGdMsg, gdVoice, parseGdLines,
            playGdSequence
          ]);

      const doGdGrade = useCallback(async () => {
        setGdTimerOn(false);
        stopAll();
        setGdDone(true);
        addGdMsg('sys', 'Evaluating GD performance...');
        const topic = gdCustom && gdCustomT.trim() ? gdCustomT.trim() : gdTopic;
        try {
          const res = await axios.post(
              BASE + '/gd-grade',
              {conversation: gdCvR.current, topic, level: diff});
          const data = res.data.data;
          setGdResult(data);
          DB.save({
            id: uid(),
            date: new Date().toISOString(),
            mode: 'gd',
            topic,
            diff,
            totalScore: data.totalScore || 0,
            maxScore: 10,
            result: data
          });
        } catch {
          addGdMsg('sys', 'Error evaluating GD.');
        }
      }, [diff, addGdMsg, stopAll, gdCustom, gdCustomT, gdTopic]);

      const startStress = useCallback(async () => {
        const newSid = uid();
        sSidR.current = newSid;
        sCvR.current = [];
        setSMsgs([]);
        setSRes(null);
        setSDone(false);
        setSTLeft(TIMER);
        setSTyping(true);
        setSSpk(false);
        setScreen('stress');
        try {
          const res = await axios.post(
              BASE + '/stress-start', {sessionId: newSid, level: diff});
          setSTyping(false);
          addSMsg('ai', res.data.message);
          sCvR.current = [{role: 'assistant', content: res.data.message}];
          setSTimerOn(true);
          if (audioR.current) {
            setSSpk(true);
            speakNatural(res.data.message, () => setSSpk(false));
          }
        } catch {
          setSTyping(false);
          addSMsg('sys', 'Connection error.');
        }
      }, [diff, addSMsg]);

      const submitStress = useCallback(async () => {
        const raw = (getRef(sEditR) || tx).trim();
        if (!raw || sTyping || sDone) return;
        sVoice.stop();
        setListening(false);
        setTx('');
        if (sEditR.current) sEditR.current.textContent = '';
        addSMsg('you', raw);
        sCvR.current = [...sCvR.current, {role: 'user', content: raw}];
        setSTyping(true);
        try {
          const res = await axios.post(
              BASE + '/stress-chat', {message: raw, sessionId: sSidR.current});
          setSTyping(false);
          if (res.data.message) {
            addSMsg('ai', res.data.message);
            sCvR.current = [
              ...sCvR.current, {role: 'assistant', content: res.data.message}
            ];
            if (audioR.current) {
              setSSpk(true);
              speakNatural(res.data.message, () => setSSpk(false));
            }
            if (res.data.isComplete) {
              setSTimerOn(false);
              setSDone(true);
              doStressGrade();
            }
          }
        } catch {
          setSTyping(false);
          addSMsg('sys', 'Connection error.');
        }
      }, [tx, sTyping, sDone, addSMsg, sVoice]);

      const doStressGrade = useCallback(async () => {
        setSTimerOn(false);
        stopAll();
        setSDone(true);
        addSMsg('sys', 'Evaluating composure...');
        try {
          const res = await axios.post(
              BASE + '/stress-grade',
              {conversation: sCvR.current, level: diff});
          const data = res.data.data;
          setSRes(data);
          DB.save({
            id: uid(),
            date: new Date().toISOString(),
            mode: 'stress',
            diff,
            totalScore: data.totalScore || 0,
            maxScore: 10,
            result: data
          });
        } catch {
          addSMsg('sys', 'Error evaluating.');
        }
      }, [diff, addSMsg, stopAll]);

      const handleFile = useCallback(async e => {
        const f = e.target.files[0];
        if (!f) return;
        const fd = new FormData();
        fd.append('resume', f);
        try {
          setUpState('uploading');
          const res = await axios.post(BASE + '/upload-resume', fd);
          setUpState(res.data.hasText ? 'ready' : 'fail');
        } catch {
          setUpState('fail');
        }
      }, []);

      const analyse = useCallback(async () => {
        if (upState !== 'ready') return;
        setAnalysing(true);
        try {
          const res = await axios.post(
              BASE + '/analyse-resume', {type: itype, difficulty: diff});
          setPlans(res.data.plans);
          setScreen('prep');
        } catch {
          alert('Could not analyse resume. Please retry.');
        }
        setAnalysing(false);
      }, [upState, itype, diff]);

      const total = history.reduce((a, b) => a + b.totalScore, 0);
      const maxScore = TOTAL_Q * 10;
      const avg = k => history.length ?
          Math.round(
              history.reduce((a, b) => a + (b[k] || 0), 0) / history.length *
              10) :
          0;
      const curPlan = plans[step - 1];
      const progPct = step > 0 ? ((step - 1) / TOTAL_Q) * 100 : 0;
      const interrupt = (editRef, voiceHook) => () => {
        stopAll();
        setTx('');
        if (editRef.current) editRef.current.textContent = '';
        setListening(true);
        voiceHook.start();
      };

      if (screen === 'history')
        return <HistoryScreen onClose =
                {() => setScreen('landing')
                } />;

  if (screen === 'results') {
    const rPct   = pct(total, maxScore);
    const allRes = history.flatMap(h => h.resources || []);
    return (
      <div className="results"><div className="res-inner">
        <div className="res-header a0"><p className="res-eyebrow">{itype} /{
                    diff} < /p><h1 className="res-title">Complete.</h1>
            </div>
        <div className="res-score a1">
          <span className="res-big">{total}</span><
            span className = 'res-denom' > /{maxScore}</span >
            <span className = 'res-verdict'>{
                rPct >= 85     ? 'Outstanding.' :
                    rPct >= 70 ? 'Strong candidate.' :
                    rPct >= 50 ? 'Room to develop.' :
                                 'Significant gaps.'} < /span>
        </div >
            <div className = 'res-bars a2'> {[['Know','knowledgeScore'],['Conf','confidenceScore'],['Align','resumeAlignment'],['Depth','depth'],['Prob','problemSolving'],['Acc','accuracy']].map(([l, k]) => (
            <div key={k} className='res-bar'><span className='res-bar-lbl'>{l}</span><div className="res-bar-track"><div className="res-bar-fill" style={{ width: avg(k) + '%' }} /></div><span className="res-bar-val">{avg(k)}%</span></div>
          ))}
        </div>
        <div className='res-qs a3'>
          {history.map((item, i) => (
            <div key={i} className={'res-q' + (item.aiDetected ? ' flagged' : '')}>
              <div className='res-q-head'>
                <div className='res-q-left'><div className='res-q-n'>{i + 1}</div><span className="res-q-area">{item.area}</span></div>
                <div className="res-q-scores"><span>K{item.knowledgeScore}</span><span>C{item.confidenceScore}</span><span className="res-q-total">{item.totalScore}/10</span></div>
              </div>
              <p className="res-q-fb">{item.feedback}</p>
              {item.improvement && <p className='res-q-tip'>{item.improvement}</p>}
            </div>
          ))}
        </div>
        <div className="res-prep-section a4">
          <div className="res-learn-header">
            <div className="res-learn-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5l8-3 8 3v7c0 4-8 6-8 6S2 16 2 12V5z"/><path d='M10 8v4M10 14v.5'/></svg></div>
            <div><h2 className='res-prep-title'>Learn &amp; Improve</h2><p className="res-learn-sub">{allRes.length > 0 ? 'Curated resources based on your answers' : 'Preparation resources for your topics'}</p></div>
          </div>
          {allRes.length > 0 && history.filter(h => h.resources?.length > 0).map((item, gi) => (
            <div key={gi} className='res-learn-group'>
              <div className='res-learn-group-head'><div className='res-q-n' style={{
              flexShrink: 0 }}>{item.questionNumber}</div><span className="res-learn-area">{item.area}</span><span className={'res-learn-score ' + sClass(pct(item.totalScore, 10) * 10)}>{
              item.totalScore}/10</span></div>
              {item.improvement && <p className="res-learn-gap"><span className="res-learn-gap-icon">&#8594;</span>{item.improvement}</p>}
              <ResourceGrid resources={item.resources} />
            </div>
          ))}
          {allRes.length === 0 && suggestLoading && <div className="res-suggest-loading"><div className="suggest-spinner" /><p>Fetching preparation resources...</p></div>}
          {
              allRes.length === 0 && !suggestLoading &&
                  suggestions.length > 0 &&
                  suggestions.map(
                      (group, gi) => (
                          <div key = {gi} className = 'res-learn-group'>
                              <div className = 'res-learn-group-head'>
                              <div className = 'res-q-n' style = {
                                {
                                  flexShrink: 0
                                }
                              }>{gi + 1} <
                              /div><span className="res-learn-area">{group.area}</span >
                              <span className = 'res-learn-score md' style = {
                                {
                                  background: 'rgba(91,157,255,.1)',
                                      color: 'var(--acc)',
                                      border: '1px solid rgba(91,157,255,.2)'
                                }
                              }>Prepare</span></div>
                              <p className = 'res-learn-gap'>
                              <span className = 'res-learn-gap-icon'>&
      # 8594;
                          </span>Study these before attempting this topic</p>
                          <ResourceGrid resources = {
                            group.resources || []
                          } />
            </div>))}
          {allRes.length === 0 && !suggestLoading && suggestions.length === 0 && <p style={{
                color: 'var(--muted)', fontSize: '14px', textAlign: 'center',
                    padding: '24px 0' }}>No resources available.</p>}
        </div>
        <div className='res-actions a5'><button className='res-ghost' onClick={restart}>New Session</button></div>
      </div></div>
    );
  }

  if (screen === 'prep') {
    return (
      <div className='prep'><div className='prep-box'>
        <div className='prep-header a0'><h1 className='prep-title'>Your Interview</h1><p className="prep-meta">{itype} / {
                diff} / {TOTAL_Q} Questions</p></div>
        <div className="prep-list a1">{plans.map((pl, i) => <div key={i} className="prep-item"><div className="prep-n">{i + 1}</div><span className='prep-area'>{pl.area}</span><span className="prep-angle">{pl.angle}</span></div>)}</div>
        <div className='prep-footer a2'>
          <button className='prep-back' onClick={() => setScreen('landing')}>Back</button>
          <button className="prep-begin" onClick={() => { setHistory([]); setStep(1); stepR.current = 1; setScreen('interview'); loadQ(1, plans); }}>Start Interview</button>
        </div>
      </div></div>
    );
  }

  if (screen === 'interview') {
    return (
      <div className="iv">
        <aside className="iv-side">
          <div className="ivs-brand"><div className="ivs-logo"><svg viewBox="0 0 12 12"><path d="M2 6h8M6 2v8" strokeLinecap="round" /></svg></div><span className='ivs-name'>Practice Room</span></div>
          <div className='ivs-prog'><div className='ivs-prog-bar'><div className='ivs-prog-fill' style={
                { width: progPct + '%' }} /></div><div className='ivs-prog-nums'><span>{
                step}/{TOTAL_Q}</span><span>{Math.round(progPct)}%</span></div></div>
          <div className="ivs-steps">
            {plans.map((pl, i) => (
              <div key={i} className={'ivs-step' + (i + 1 === step ? ' now' : i + 1 < step ? ' done' : '')}>
                <div className="ivs-dot">{i + 1 < step ? <span>&#10003;</span> : i + 1}</div>
                <span className="ivs-step-lbl">{pl.area}</span>
              </div>
            ))}
          </div>
          <div className='ivs-bottom'>
            {timerOn && <div className='ivs-timer' style={{
              color: tColor(tLeft) }}>{fmtTime(tLeft)}</div>}
            <div className="ivs-btn" onClick={() => { if (audioOn) window.speechSynthesis?.cancel(); setAudioOn(p => !p); }}>{audioOn ? 'Audio On' : 'Audio Off'}</div>
            <button className='ivs-btn danger' onClick={skip}>Skip Question</button>
          </div>
        </aside>
        <main className="iv-main">
          <div className="iv-topbar"><div className="ivt-left"><div className={'ivt-dot' + (speaking ? ' speaking' : aiTyping ? ' active' : '')} /><span className='ivt-status'>{speaking ? 'Speaking' : aiTyping ? 'Thinking' : 'Listening'}</span></div>{curPlan && <span className='ivt-topic'>{curPlan.area}</span>}</div>
          <MsgList list={msgs} label='AI' typing={aiTyping} endRef={
              endR} />
          {feedback && <ScoreCard data={feedback} metrics={[['Knowledge',feedback.knowledgeScore],['Confidence',feedback.confidenceScore],['Relevance',feedback.resumeAlignment],['Depth',feedback.depth]]} onNext={goNext} nextLabel={step < TOTAL_Q ? 'Next Question' : 'View Results'} />}
          {
            !feedback && started &&
                <VoiceInput editRef = {editR} tx = {tx} setTx =
                     {setTx} listening = {listening} setListening =
                         {setListening} voice = {voice} onSubmit =
                             {submitAnswer} disabled = {aiTyping} speaking =
                                 {speaking} onInterrupt =
                 { interrupt(editR, voice) } />}
        </main><
                    /div>
    );
  }

  if (screen === 'gd') {
    const activeTopic = gdCustom && gdCustomT.trim() ? gdCustomT.trim() : gdTopic;
    return (
      <div className="iv">
        <aside className="iv-side gd-side">
          <div className="ivs-brand"><div className="ivs-logo gd-logo"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="4" cy="4" r="2" />
                    <circle cx = '9' cy = '4' r = '2' />
                    <path d = 'M1 11c0-2 1.5-3 3-3h4c1.5 0 3 1 3 3' />
                    </svg></div>
                    <span className = 'ivs-name'>Group Discussion</span></div>
                    <div className = 'gd-topic-card'>
                    <p className = 'gd-topic-label'>
                        Topic</p><p className="gd-topic-text">{activeTopic}</p>
                    </div>
          <div className="gd-personas">
            <p className="gd-personas-label">Participants</p>{
                        gdPersR.current.map(
                            (p, i) => (
                                <div key = {i} className = 'gd-persona-item'>
                                <div className = 'gd-persona-av' style = {
                                  {
                background: P_COLORS[i]
                                  }
                                }>{p.name[0]} <
                                /div>
                <div><span className="gd-persona-name">{p.name}</span >
                                <span className = 'gd-persona-stance'>{
                                    p.stance} the
                                    topic<
                                        /span><span className="gd-persona-style">{p.style.split(',')[0]}</span>
                                </div>
              </div>))} <
                    div className = 'gd-persona-item' >
                <div className = 'gd-persona-av you-av'>
                    Y</div><div><span className="gd-persona-name">You</span>
                <span className = 'gd-persona-stance'>Make
            your case</span></div></div>
          </div>
                <div className = 'ivs-bottom'>{
                  gdTimerOn &&!gdDone && < div className = 'ivs-timer' style = {
                    { color:
              tColor(gdTLeft) }}>{fmtTime(gdTLeft)}</div>}
            {!gdDone && <button className="ivs-btn danger" onClick={() => { setGdTimerOn(false); doGdGrade(); }}>End Discussion</button>}
          </div>
        </aside>
        <main className='iv-main'>
          <div className='iv-topbar'>
            <div className='ivt-left'><div className={
            'ivt-dot' + (gdTyping ? ' active' : gdSpk ? ' speaking' : '')} /><span className="ivt-status gd-status">{gdTyping ? 'Panel thinking...' : gdSpk && gdSpeaker ? gdSpeaker + ' is speaking...' : gdDone ? 'Discussion ended' : 'Your turn to speak'}</span></div>
            <span className="ivt-topic gd-badge">GD Round</span>
          </div>
          <div className="iv-msgs gd-msgs">
            {gdMsgs.map((m, i) => {
              if (m.role === 'sys') return <div key={i} className="msg sys"><span className="msg-sys-text">{m.content}</span></div>;
              if (m.role === 'you') return <div key={i} className="msg you"><div className="msg-av you-av-sm">You</div><div className='msg-body'><p className='msg-text'>{m.content}</p><p className="msg-ts">{m.ts.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</p></div></div>;
              const ci = m.content.indexOf(':');
              const name = ci > -1 && ci < 12 ? m.content.slice(0, ci).trim() : 'Panel';
              const text = ci > -1 && ci < 12 ? m.content.slice(ci + 1).trim() : m.content;
              const pi   = gdPersR.current.findIndex(p => p.name === name);
              return <div key={i} className='msg gd-panel-msg'><div className='msg-av gd-av' style={{
            background: P_COLORS[pi] || P_COLORS[0] }}>{name[0]}</div><div className="msg-body"><p className="msg-speaker">{name}</p><p className='msg-text'>{text}</p><p className="msg-ts">{m.ts.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</p></div></div>;
        })}
            {gdTyping && <div className='typing-row'><div className='typing-av'>GD</div><div className="typing-bubble"><span /><span /><span /></div></div>}
            <div ref={
      gdEndR} />
          </div>
          {gdResult && <ScoreCard data={gdResult} metrics={[['Init',gdResult.initiationScore],['Content',gdResult.contentScore],['Lead',gdResult.leadershipScore],['Comm',gdResult.communicationScore]]} onNext={restart} nextLabel='Back to Home' title='GD Evaluation' />}
          {!gdResult && !gdDone && <VoiceInput editRef={gdEditR} tx={tx} setTx={setTx} listening={listening} setListening={setListening} voice={gdVoice} onSubmit={submitGd} disabled={gdTyping} label='Contribute' speaking={gdSpk} onInterrupt={
      interrupt(gdEditR, gdVoice)} />}
        </main>
      </div>
    );
  }

  if (screen === 'stress') {
    return (
      <div className="iv">
        <aside className="iv-side stress-side">
          <div className="ivs-brand"><div className="ivs-logo stress-logo"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M6 1v6M6 9v2" /><circle cx='6' cy='6' r='5' /></svg></div><span className='ivs-name'>Stress Interview</span></div>
          <div className='stress-info-card'><p className='stress-info-title'>What to expect</p><ul className="stress-info-list">{['Deliberate interruptions','Your claims challenged','Silence as pressure','Impossible comparisons','Stay calm. Hold ground.'].map((t, i) => <li key={i}>{t}</li>)}</ul></div>
          <div className='ivs-bottom'>
            {sTimerOn && !sDone && <div className='ivs-timer' style={{
      color: tColor(sTLeft) }}>{fmtTime(sTLeft)}</div>}
            {!sDone && <button className="ivs-btn danger" onClick={() => { setSTimerOn(false); doStressGrade(); }}>End Interview</button>}
          </div>
        </aside>
        <main className='iv-main'>
          <div className='iv-topbar'><div className='ivt-left'><div className={
      'ivt-dot' + (sSpk ? ' speaking' : sTyping ? ' active' : '')} /><span className="ivt-status stress-status">{sTyping ? 'Formulating...' : sDone ? 'Ended' : sSpk ? 'Speaking' : 'Awaiting response'}</span></div><span className="ivt-topic stress-badge">Stress Round</span></div>
          <MsgList list={sMsgs} label="IV" typing={sTyping} endRef={sEndR} />
          {sRes && <ScoreCard data={sRes} metrics={[['Calm',sRes.composureScore],['Assert',sRes.assertivenessScore],['Recovery',sRes.recoveryScore],['Auth',sRes.authenticityScore]]} onNext={restart} nextLabel='Back to Home' title='Stress Evaluation' />}
          {!sRes && !sDone && <VoiceInput editRef={sEditR} tx={tx} setTx={setTx} listening={listening} setListening={setListening} voice={sVoice} onSubmit={submitStress} disabled={sTyping || sSpk} label='Reply' speaking={sSpk} onInterrupt={
      interrupt(sEditR, sVoice)} />}
        </main>
      </div>
    );
  }

  return (
    <div className="land"><div className="land-box">
      <div className="land-head a0">
        <div className="land-brand"><div className="land-logo"><svg viewBox="0 0 16 16"><path d="M4 8h8M8 4v8" strokeLinecap="round" /></svg></div><h1 className='land-title'>Practice Room</h1></div>
        <button className='hist-btn' onClick={() => setScreen('history')}>
          <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'><circle cx='8' cy='8' r='6' /><path d='M8 5v3l2 2' /></svg>
          History
        </button>
      </div>
      <div className="land-mode-tabs a0">
        {[{ id:'interview', label:'Interview', icon:'&#128100;', desc:'One-on-one personalised interview' }, { id:'gd', label:'Group Discussion', icon:'&#128172;', desc:'Multi-participant GD round' }, { id:'stress', label:'Stress Interview', icon:'&#9889;', desc:'Pressure test your composure' }].map(m => (
          <button key={m.id} className={'mode-tab' + (gdMode === m.id ? ' on' : '')} onClick={() => setGdMode(m.id)}>
            <span className="mode-tab-icon" dangerouslySetInnerHTML={{ __html: m.icon }} /><span className='mode-tab-label'>{m.label}</span><span className="mode-tab-desc">{m.desc}</span>
          </button>
        ))}
      </div>
      <div className='land-controls a1'>
        <div className='ctrl-card'>
          <label className='ctrl-upload' htmlFor='file-in'>
            <div className={'ctrl-upload-icon' + (upState === 'ready' ? ' ok' : upState === 'fail' ? ' err' : '')}>
              {upState === 'ready' ? <svg viewBox='0 0 16 16'><path d='M3 8l4 4 6-6' /></svg> : upState === 'fail' ? <svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" /></svg> : upState === 'uploading' ? <span className="spin" style={{ fontSize:'13px', color:'var(--muted)' }}>o</span> : <svg viewBox='0 0 16 16'><path d='M8 11V5M5 7l3-3 3 3M4 13h8' /></svg>}
            </div>
            <div className='ctrl-upload-text'>
              <span className={'ctrl-upload-main' + (upState === 'ready' ? ' ok' : upState === 'fail' ? ' err' : upState === 'idle' ? ' dim' : '')}>{upState === 'uploading' ? 'Uploading...' : upState === 'ready' ? 'Resume uploaded' : upState === 'fail' ? 'Upload failed' : 'Upload Resume'}</span>
              <span className="ctrl-upload-sub">.docx format</span>
            </div>
            <span className="ctrl-upload-arrow">&#8599;</span>
          </label>
          <input id="file-in" type="file" accept=".docx" onChange={handleFile} style={{ display:'none' }} />
        </div>
        <div className="ctrl-card a2"><div className="ctrl-head"><span className="label">Difficulty</span></div><div className="ctrl-body"><div className="seg">{['Easy','Medium','Hard'].map(d => <button key={d} className={'seg-btn' + (diff === d ? ' on' : '')} onClick={() => setDiff(d)}>{d}</button>)}</div></div></div>
        {gdMode === 'interview' && <div className="ctrl-card a3"><div className="ctrl-head"><span className="label">Type</span></div><div className="ctrl-body"><div className="seg">{['Technical','HR'].map(t => <button key={t} className={'seg-btn' + (itype === t ? ' on' : '')} onClick={() => setItype(t)}>{t}</button>)}</div></div></div>}
        {gdMode === 'gd' && (
          <div className="ctrl-card a3 gd-topic-ctrl"><div className="ctrl-head"><span className="label">GD Topic</span></div>
            <div className="ctrl-body gd-topic-body">
              <div className="gd-topic-toggle"><button className={'seg-btn' + (!gdCustom ? ' on' : '')} onClick={() => setGdCustom(false)}>Preset</button><button className={'seg-btn' + (gdCustom ? ' on' : '')} onClick={() => setGdCustom(true)}>Custom</button></div>
              {
      !gdCustom ? <select className = 'gd-topic-select' value = {
                       gdTopic} onChange = {e => setGdTopic(e.target.value)}> {GD_TOPICS.map((t, i) => <option key={i} value={t}>{t}</option>)}</select>
                : <input className='gd-topic-input' type='text' placeholder='Enter GD topic...' value={gdCustomT} onChange={e => setGdCustomT(e.target.value)} maxLength={
          120} />}
            </div>
          </div>
        )}
      </div>
      {gdMode === 'interview' && <button className={'land-cta a4' + (upState === 'ready' && !analysing ? '' : ' off')} onClick={analyse}>{analysing ? 'Analysing...' : 'Begin Interview'}</button>}
      {gdMode === 'gd'        && <button className={'land-cta gd-cta a4' + (upState === 'ready' ? '' : ' off')} onClick={startGd}>Join Discussion</button>}
      {
          gdMode ===
              'stress' &&<
                  button className =
                      {'land-cta stress-cta a4' +
                       (upState === 'ready' ? '' :
                                              ' off')} onClick = {startStress}>
                  Start Stress Interview<
                      /button>}
      {gdMode === 'interview' && analysing && <p className="land-status a5">Reading your resume...</p>}
      {
          gdMode !== 'interview' &&upState !==
              'ready' &&<p className = 'land-status a5'>Upload your resume
        first</p>}
    </div>< /div>
  );
}