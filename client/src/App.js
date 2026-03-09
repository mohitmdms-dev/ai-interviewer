import './App.css';

import axios from 'axios';
import {jsPDF} from 'jspdf';
import React, {useCallback, useEffect, useRef, useState} from 'react';

const TOTAL_QUESTIONS = 5;
const TIME_PER_QUESTION = 420;
const BASE = 'http://localhost:5000';

const LEVELS = [
  {id: 'junior', label: 'Junior'},
  {id: 'mid', label: 'Mid'},
  {id: 'senior', label: 'Senior'},
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function speakNatural(text, opts) {
  var onDone = (opts && opts.onDone) || null;
  return new Promise(function(resolve) {
    var s = window.speechSynthesis;
    if (!s) {
      if (onDone) onDone();
      resolve();
      return;
    }
    s.cancel();
    var clean = text.replace(/[*_`#>~]/g, '').replace(/\s+/g, ' ').trim();
    if (!clean) {
      if (onDone) onDone();
      resolve();
      return;
    }
    var chunks = (clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean])
                     .map(function(c) {
                       return c.trim();
                     })
                     .filter(Boolean);
    var voices = s.getVoices();
    var voice = (voices.find(function(v) {
      return v.name === 'Google UK English Female';
    }) || voices.find(function(v) {
      return v.name === 'Google US English';
    }) || voices.find(function(v) {
      return v.name.indexOf('Samantha') > -1;
    }) || voices.find(function(v) {
      return v.name.indexOf('Karen') > -1;
    }) || voices.find(function(v) {
      return v.lang === 'en-GB' && !v.localService;
    }) || voices.find(function(v) {
      return v.lang === 'en-US' && !v.localService;
    }) || voices.find(function(v) {
      return v.lang.indexOf('en') === 0;
    }));
    var idx = 0;
    function next() {
      if (idx >= chunks.length) {
        if (onDone) onDone();
        resolve();
        return;
      }
      var u = new SpeechSynthesisUtterance(chunks[idx++]);
      if (voice) u.voice = voice;
      u.rate = 0.87;
      u.pitch = 1.04;
      u.volume = 1.0;
      u.onend = function() {
        setTimeout(next, 110);
      };
      u.onerror = function() {
        setTimeout(next, 100);
      };
      s.speak(u);
    }
    next();
  });
}

function useContinuousVoice(onChange) {
  var active = useRef(false);
  var rec = useRef(null);
  var acc = useRef('');
  var sf = useRef('');

  var start = useCallback(function() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Voice input requires Chrome or Edge.');
      return;
    }
    active.current = true;
    acc.current = '';
    sf.current = '';
    function boot() {
      if (!active.current) return;
      var r = new SR();
      rec.current = r;
      r.lang = 'en-US';
      r.continuous = true;
      r.interimResults = true;
      r.onresult = function(e) {
        var fin = '', interim = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var t = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            fin += t + ' ';
          } else {
            interim += t;
          }
        }
        if (fin) sf.current += fin;
        onChange((acc.current + sf.current + interim).trim());
      };
      r.onend = function() {
        if (!active.current) return;
        acc.current += sf.current;
        sf.current = '';
        setTimeout(boot, 80);
      };
      r.onerror = function(e) {
        if (!active.current) return;
        if (e.error === 'no-speech' || e.error === 'audio-capture' ||
            e.error === 'network') {
          acc.current += sf.current;
          sf.current = '';
          setTimeout(boot, 150);
        }
      };
      try {
        r.start();
      } catch (err) {
      }
    }
    boot();
  }, [onChange]);

  var stop = useCallback(function() {
    active.current = false;
    try {
      if (rec.current) rec.current.stop();
    } catch (err) {
    }
    var final = (acc.current + sf.current).trim();
    acc.current = '';
    sf.current = '';
    return final;
  }, []);

  return {start: start, stop: stop};
}

export default function App() {
  var s0 = useState('landing');
  var screen = s0[0];
  var setScreen = s0[1];
  var s1 = useState('Technical');
  var itype = s1[0];
  var setItype = s1[1];
  var s2 = useState('Medium');
  var diff = s2[0];
  var setDiff = s2[1];
  var s3 = useState('mid');
  var level = s3[0];
  var setLevel = s3[1];
  var s4 = useState('idle');
  var upState = s4[0];
  var setUpState = s4[1];
  var s5 = useState([]);
  var plans = s5[0];
  var setPlans = s5[1];
  var s6 = useState(false);
  var analysing = s6[0];
  var setAnalysing = s6[1];
  var s7 = useState(0);
  var step = s7[0];
  var setStep = s7[1];
  var s8 = useState([]);
  var msgs = s8[0];
  var setMsgs = s8[1];
  var s9 = useState('');
  var tx = s9[0];
  var setTx = s9[1];
  var s10 = useState([]);
  var setCvState = s10[1];
  var s11 = useState(false);
  var started = s11[0];
  var setStarted = s11[1];
  var s12 = useState(null);
  var feedback = s12[0];
  var setFeedback = s12[1];
  var s13 = useState(false);
  var setLoading = s13[1];
  var s14 = useState(false);
  var aiTyping = s14[0];
  var setAiTyping = s14[1];
  var s15 = useState([]);
  var history = s15[0];
  var setHistory = s15[1];
  var s16 = useState(TIME_PER_QUESTION);
  var tLeft = s16[0];
  var setTLeft = s16[1];
  var s17 = useState(false);
  var timerOn = s17[0];
  var setTimerOn = s17[1];
  var s18 = useState(false);
  var listening = s18[0];
  var setListening = s18[1];
  var s19 = useState(true);
  var audioOn = s19[0];
  var setAudioOn = s19[1];
  var s20 = useState(false);
  var speaking = s20[0];
  var setSpeaking = s20[1];
  var s21 = useState(uid);
  var sid = s21[0];

  var pendingR = useRef(false);
  var audioR = useRef(true);
  var timerR = useRef(null);
  var endR = useRef(null);
  var editR = useRef(null);
  var plansR = useRef([]);
  var stepR = useRef(0);
  var cvR = useRef([]);

  useEffect(function() {
    audioR.current = audioOn;
  }, [audioOn]);
  useEffect(function() {
    plansR.current = plans;
  }, [plans]);
  useEffect(function() {
    stepR.current = step;
  }, [step]);
  useEffect(function() {
    if (endR.current) endR.current.scrollIntoView({behavior: 'smooth'});
  }, [msgs, aiTyping]);
  useEffect(function() {
    var s = window.speechSynthesis;
    if (!s) return;
    s.getVoices();
    s.addEventListener('voiceschanged', function() {
      s.getVoices();
    });
  }, []);

  var addMsg = useCallback(function(role, content) {
    setMsgs(function(p) {
      return p.concat([{role: role, content: content, ts: new Date()}]);
    });
  }, []);

  var setCv = useCallback(function(u) {
    setCvState(function(p) {
      var n = typeof u === 'function' ? u(p) : u;
      cvR.current = n;
      return n;
    });
  }, []);

  var doGrade = useCallback(async function() {
    setTimerOn(false);
    clearTimeout(timerR.current);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeaking(false);
    pendingR.current = false;
    setLoading(true);
    addMsg('sys', 'Grading...');
    var s = stepR.current;
    var pl = plansR.current[s - 1];
    var cv = cvR.current.slice();
    try {
      var res = await axios.post(BASE + '/grade', {
        conversation: cv,
        questionNumber: s,
        type: itype,
        difficulty: diff,
        level: level,
        area: (pl && pl.area) || '',
        angle: (pl && pl.angle) || '',
      });
      setFeedback(res.data.data);
      setHistory(function(p) {
        return p.concat([Object.assign(
            {
              questionNumber: s,
              area: (pl && pl.area) || '',
              angle: (pl && pl.angle) || '',
              whyThisQuestion: (pl && pl.whyThisQuestion) || '',
            },
            res.data.data)]);
      });
    } catch (err) {
      addMsg('sys', 'Error grading.');
    }
    setLoading(false);
  }, [itype, diff, level, addMsg]);

  useEffect(function() {
    if (timerOn && tLeft > 0) {
      timerR.current = setTimeout(function() {
        setTLeft(function(t) {
          return t - 1;
        });
      }, 1000);
    } else if (tLeft === 0 && timerOn) {
      setTimerOn(false);
      addMsg('sys', 'Time up.');
      doGrade();
    }
    return function() {
      clearTimeout(timerR.current);
    };
  }, [timerOn, tLeft, doGrade, addMsg]);

  var speak = useCallback(async function(text, cb) {
    if (!audioR.current) {
      if (cb) cb();
      return;
    }
    setSpeaking(true);
    await speakNatural(text, {
      onDone: function() {
        setSpeaking(false);
        if (cb) cb();
        if (pendingR.current) {
          pendingR.current = false;
          doGrade();
        }
      }
    });
  }, [doGrade]);

  var stopSpeak = useCallback(function() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeaking(false);
    if (pendingR.current) {
      pendingR.current = false;
      setTimeout(doGrade, 100);
    }
  }, [doGrade]);

  var onTx = useCallback(function(t) {
    setTx(t);
    if (editR.current && editR.current.textContent !== t) {
      var sel = window.getSelection();
      var off = (sel && sel.focusOffset) || 0;
      editR.current.textContent = t;
      try {
        if (editR.current.firstChild) {
          var rng = document.createRange();
          rng.setStart(editR.current.firstChild, Math.min(off, t.length));
          rng.collapse(true);
          sel.removeAllRanges();
          sel.addRange(rng);
        }
      } catch (err) {
      }
    }
  }, []);

  var voiceHook = useContinuousVoice(onTx);
  var vStart = voiceHook.start;
  var vStop = voiceHook.stop;

  var startRec = useCallback(function() {
    stopSpeak();
    setTx('');
    if (editR.current) editR.current.textContent = '';
    setListening(true);
    vStart();
  }, [stopSpeak, vStart]);

  var stopRec = useCallback(function() {
    vStop();
    setListening(false);
  }, [vStop]);

  var clearAns = useCallback(function() {
    vStop();
    setListening(false);
    setTx('');
    if (editR.current) editR.current.textContent = '';
  }, [vStop]);

  async function handleFile(e) {
    var f = e.target.files[0];
    if (!f) return;
    var fd = new FormData();
    fd.append('resume', f);
    try {
      setLoading(true);
      setUpState('uploading');
      var res = await axios.post(BASE + '/upload-resume', fd);
      setUpState(res.data.hasText ? 'ready' : 'fail');
    } catch (err) {
      setUpState('fail');
    }
    setLoading(false);
  }

  async function analyse() {
    if (upState !== 'ready') return;
    setAnalysing(true);
    try {
      var res = await axios.post(BASE + '/analyse-resume', {
        type: itype,
        difficulty: diff,
        level: level,
      });
      setPlans(res.data.plans);
      setScreen('prep');
    } catch (err) {
      alert('Could not analyse resume. Please retry.');
    }
    setAnalysing(false);
  }

  var loadQ = useCallback(async function(s, ps) {
    var pl = ps[s - 1];
    pendingR.current = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeaking(false);
    setMsgs([]);
    setFeedback(null);
    setStarted(false);
    setCv([]);
    setTimerOn(false);
    setTLeft(TIME_PER_QUESTION);
    setTx('');
    setListening(false);
    if (editR.current) editR.current.textContent = '';
    setAiTyping(true);
    try {
      var res = await axios.post(BASE + '/start-question', {
        questionNumber: s,
        type: itype,
        difficulty: diff,
        level: level,
        area: pl.area,
        angle: pl.angle,
        sessionId: sid + '-q' + s,
      });
      setAiTyping(false);
      addMsg('ai', res.data.message);
      setCv([{role: 'assistant', content: res.data.message}]);
      setStarted(true);
      setTimerOn(true);
      speak(res.data.message);
    } catch (err) {
      setAiTyping(false);
      addMsg('sys', 'Connection error.');
    }
  }, [itype, diff, level, sid, addMsg, setCv, speak]);

  var begin = useCallback(function() {
    setHistory([]);
    setStep(1);
    stepR.current = 1;
    setScreen('interview');
    loadQ(1, plans);
  }, [plans, loadQ]);

  var submitAnswer = useCallback(async function() {
    var raw = ((editR.current && editR.current.textContent) || tx).trim();
    if (!raw || aiTyping) return;
    stopRec();
    stopSpeak();
    pendingR.current = false;
    setTx('');
    if (editR.current) editR.current.textContent = '';
    addMsg('you', raw);
    setCv(function(p) {
      return p.concat([{role: 'user', content: raw}]);
    });
    setAiTyping(true);
    try {
      var res = await axios.post(BASE + '/chat', {
        message: raw,
        sessionId: sid + '-q' + stepR.current,
      });
      setAiTyping(false);
      if (res.data.message) {
        addMsg('ai', res.data.message);
        setCv(function(p) {
          return p.concat([{role: 'assistant', content: res.data.message}]);
        });
        if (res.data.isComplete) {
          pendingR.current = true;
          speak(res.data.message, function() {
            if (pendingR.current) {
              pendingR.current = false;
              doGrade();
            }
          });
        } else {
          speak(res.data.message);
        }
      }
    } catch (err) {
      setAiTyping(false);
      addMsg('sys', 'Connection error.');
    }
  }, [tx, aiTyping, stopRec, stopSpeak, addMsg, setCv, sid, speak, doGrade]);

  var goNext = useCallback(function() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeaking(false);
    pendingR.current = false;
    if (step < TOTAL_QUESTIONS) {
      var n = step + 1;
      setStep(n);
      stepR.current = n;
      loadQ(n, plansR.current);
    } else {
      setScreen('results');
    }
  }, [step, loadQ]);

  var skip = useCallback(function() {
    clearTimeout(timerR.current);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeaking(false);
    pendingR.current = false;
    stopRec();
    var pl = plansR.current[step - 1];
    setHistory(function(p) {
      return p.concat([{
        questionNumber: step,
        area: (pl && pl.area) || 'Skipped',
        angle: (pl && pl.angle) || '',
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
        feedback: 'Skipped.',
        strengths: '',
        improvement: 'Attempt every question.',
        resources: [],
      }]);
    });
    if (step < TOTAL_QUESTIONS) {
      var n = step + 1;
      setStep(n);
      stepR.current = n;
      loadQ(n, plansR.current);
    } else {
      setScreen('results');
    }
  }, [step, stopRec, loadQ]);

  var restart = useCallback(function() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setHistory([]);
    setStep(0);
    setFeedback(null);
    setMsgs([]);
    setTx('');
    setPlans([]);
    setUpState('idle');
    pendingR.current = false;
    setScreen('landing');
  }, []);

  var downloadPDF = useCallback(function() {
    var doc = new jsPDF();
    var pw = doc.internal.pageSize.getWidth();
    var tot = history.reduce(function(a, b) {
      return a + b.totalScore;
    }, 0);
    var lv = LEVELS.find(function(l) {
      return l.id === level;
    });
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Interview Report', pw / 2, 24, {align: 'center'});
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(
        (lv ? lv.label : '') + ' - ' + itype + ' - ' + diff +
            ' - Score: ' + tot + '/' + (TOTAL_QUESTIONS * 10),
        pw / 2, 33, {align: 'center'});
    doc.setDrawColor(200, 200, 200);
    doc.line(15, 38, pw - 15, 38);
    var y = 46;
    history.forEach(function(item, i) {
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Q' + (i + 1) + ': ' + item.area, 15, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(0, 120, 70);
      doc.text(
          'Score: ' + item.totalScore + '/10  K:' + item.knowledgeScore +
              '  C:' + item.confidenceScore + '  R:' + item.resumeAlignment,
          15, y);
      y += 7;
      doc.setTextColor(40, 40, 40);
      var fl = doc.splitTextToSize(item.feedback || '', pw - 30);
      doc.text(fl, 15, y);
      y += fl.length * 6 + 3;
      var il = doc.splitTextToSize(item.improvement || '', pw - 30);
      doc.text(il, 15, y);
      y += il.length * 6 + 8;
      doc.setDrawColor(220, 220, 220);
      doc.line(15, y - 4, pw - 15, y - 4);
      doc.setTextColor(0, 0, 0);
    });
    doc.save('interview_report.pdf');
  }, [history, level, itype, diff]);

  var total = history.reduce(function(a, b) {
    return a + b.totalScore;
  }, 0);
  var maxScore = TOTAL_QUESTIONS * 10;
  var pct = Math.round((total / maxScore) * 100);

  function avg(k) {
    if (!history.length) return 0;
    return Math.round(history.reduce(function(a, b) {
      return a + (b[k] || 0);
    }, 0) / history.length * 10);
  }

  var aiFlags = history
                    .filter(function(h) {
                      return h.aiDetected;
                    })
                    .length;
  var tColor = tLeft > 240 ? 'var(--ink)' :
      tLeft > 90           ? '#f0a030' :
                             'var(--red)';
  var allRes = history.reduce(function(a, h) {
    return a.concat(h.resources || []);
  }, []);
  var selLv = LEVELS.find(function(l) {
    return l.id === level;
  });
  var curPlan = plans[step - 1];
  var hasAns =
      ((editR.current && editR.current.textContent) || tx).trim().length > 0;
  var progPct = step > 0 ? ((step - 1) / TOTAL_QUESTIONS) * 100 : 0;

  if (screen === 'results') {
    return (
      <div className='results'>
        <div className='res-inner'>
          <div className='res-header a0'>
            <p className='res-eyebrow'>{
      selLv ? selLv.label : ''} / {itype} / {diff}</p>
            <h1 className="res-title">Complete.</h1>
          </div>

          <div className="res-score a1">
            <span className="res-big">{total}</span>
            <span className='res-denom'>/{maxScore}</span>
            <span className='res-verdict'>
              {pct >= 85 ? 'Outstanding performance.' : pct >= 70 ? 'Strong candidate.' : pct >= 50 ? 'Room to develop.' : 'Significant gaps identified.'}
            </span>
          </div>

          {aiFlags > 0 && (
            <p className='res-ai-note a2'>{aiFlags} response{aiFlags > 1 ? 's' : ''} flagged for AI-generated content</p>
          )}

          <div className="res-bars a2">
            {[
              { l: 'Know',  k: 'knowledgeScore',  w: '80%' },
              { l: 'Conf',  k: 'confidenceScore', w: '20%' },
              { l: 'Align', k: 'resumeAlignment',  w: null  },
              { l: 'Depth', k: 'depth',            w: null  },
              { l: 'Prob',  k: 'problemSolving',   w: null  },
              { l: 'Acc',   k: 'accuracy',         w: null  },
            ].map(function(m) {
              return (
                <div key={m.k} className="res-bar">
                  <span className="res-bar-lbl">{m.l}{m.w ? <em> {m.w}</em> : null}</span>
                  <div className="res-bar-track">
                    <div className="res-bar-fill" style={{ width: avg(m.k) + '%' }}></div>
                  </div>
                  <span className="res-bar-val">{avg(m.k)}%</span>
                </div>
              );
            })}
          </div>

          <div className='res-qs a3'>
            {history.map(function(item, i) {
              return (
                <div key={i} className={'res-q' + (item.aiDetected ? ' flagged' : '')}>
                  <div className='res-q-head'>
                    <div className='res-q-left'>
                      <div className='res-q-n'>{i + 1}</div>
                      <span className="res-q-area">{item.area}</span>
                      <span className='res-q-ang'>{item.angle}</span>
                    </div>
                    <div className='res-q-scores'>
                      <span>K{item.knowledgeScore}</span>
                      <span>C{item.confidenceScore}</span>
                      <span>R{item.resumeAlignment}</span>
                      <span className="res-q-total">{item.totalScore}/10</span>
                    </div>
                  </div>
                  {item.aiDetected ? <p className="res-q-ai">{item.aiFlagReason}</p> : null}
                  <p className='res-q-fb'>{item.feedback}</p>
                  {item.strengths ? <p className="res-q-good">{item.strengths}</p> : null}
                  {
      item.improvement ? <p className = 'res-q-tip'>{item.improvement} <
          /p> : null}
                </div >);
            })
  }
  </div>

          <div className="res-prep-section a4">
            <div className="res-prep-header">
              <div className="res-prep-icon">
                <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 2L2 6v6l7 4 7-4V6L9 2z"/>
      <path d = 'M9 2v16M2 6l7 4 7-4' /></svg>
              </div><div>
      <h2 className = 'res-prep-title'>Preparation Resources<
          /h2>
                <p className="res-prep-sub">Curated for your weak areas this session</p>
      </div>
            </div>

  {
    history.filter(function(h) {
      return h.resources && h.resources.length > 0;
           }).length === 0 &&
        (<div className = 'res-prep-empty'>No resources returned this session.<
             /div>
            )}

            {history.filter(function(h) { return h.resources && h.resources.length > 0; }).map(function(item, gi) {
              return (
                <div key={gi} className="res-prep-group">
                  <div className="res-prep-group-head">
                    <div className="res-prep-group-n">{item.questionNumber}</div>
         <span className = 'res-prep-group-area'>{item.area} <
         /span>
                    <span className="res-prep-group-score">{item.totalScore}/10 <
         /span>
                  </div > <
                                              div
                                                  className =
                                                      'res-prep-grid'>{item.resources
                                                                           .map(
                                                                               function(
                                                                                   r,
                                                                                   ri) {
      var domain = '';
      try {
        domain = new URL(r.url).hostname.replace('www.', '');
      } catch (e) {
        domain = '';
      }
      var tag = domain.indexOf('youtube') > -1 ? 'Video' :
          domain.indexOf('github') > -1        ? 'Code' :
          domain.indexOf('medium') > -1        ? 'Article' :
          domain.indexOf('docs.') > -1         ? 'Docs' :
          domain.indexOf('coursera') > -1 || domain.indexOf('udemy') > -1 ?
                                         'Course' :
                                         'Read';
      return (
          <a key = {ri} href = {r.url} target = '_blank' rel =
               'noreferrer' className = 'res-prep-card'>
          <div className = 'res-prep-card-top'>
          <span className = 'res-prep-tag'>{tag} <
          /span>
                            <span className="res-prep-domain">{domain}</span >
          </div>
                          <p className="res-prep-card-title">{r.title}</p>
          <p className = 'res-prep-card-reason'>{r.reason} <
          /p>
                          <div className="res-prep-card-foot">
                            <span className="res-prep-card-cta">Open resource &#8599;</span >
          </div>
                        </a>);
                                                                               })} <
         /div>
                </div >);
  })
}
          </div>

          <div className="res-actions a5">
            <button className="res-ghost" onClick={restart}>New Session</button>
            <button className='res-dl' onClick={downloadPDF}>Download Report</button>
          </div>
        </div>
      </div>
    );
          }

          if (screen === 'prep') {
            return (
                <div className = 'prep'><div className = 'prep-box'>
                <div className = 'prep-header a0'>
                <h1 className = 'prep-title'>Your Interview<
                    /h1>
            <p className="prep-meta">{selLv ? selLv.label : ''} /{
    itype
                    } / {diff} /{TOTAL_QUESTIONS} Questions</p>
          </div>

                    <div className = 'prep-list a1'>{plans.map(function(pl, i) {
    return (
        <div key = {i} className = 'prep-item'>
        <div className = 'prep-n'>{i + 1} <
        /div>
                  <span className="prep-area">{pl.area}</span >
        <span className = 'prep-angle'>{pl.angle} <
        /span>
                </div >);
                    })} <
                    /div>

          <div className="prep-footer a2">
            <button className="prep-back" onClick={function() { setScreen('landing'); }}>Back</button>
                <button className = 'prep-begin' onClick = {begin}>Start
                    Interview</button>
          </div></div>
      </div>);
          }

          if (screen === 'interview') {
            return (
                <div className = 'iv'><aside className = 'iv-side'>
                <div className = 'ivs-brand'><div className = 'ivs-logo'>
                <svg viewBox = '0 0 12 12'>
                <path d = 'M2 6h8M6 2v8' strokeLinecap = 'round' />
                </svg>
            </div><span className = 'ivs-name'>AI
                    Interviewer</span>
          </div>

                <div className = 'ivs-prog'><div className = 'ivs-prog-bar'>
                <div className = 'ivs-prog-fill' style = {
                  {
    width: progPct + '%'
                  }
                }></div>
            </div><div className = 'ivs-prog-nums'>
                <span> {
    step
                } / {TOTAL_QUESTIONS}</span > <span>{Math.round(progPct)} %
                    </span>
            </div>
                    </div>

          <div className="ivs-steps">
            {plans.map(function(pl, i) {
              var cls = 'ivs-step' + (i + 1 === step ? ' now' : i + 1 < step ? ' done' : '');
              return (
                <div key={i} className={cls}>
                  <div className="ivs-dot">{i + 1 < step ? '&#10003;' : i + 1}</div>
                    <span className = 'ivs-step-lbl'>{pl.area} <
                /span>
                </div >);
          })
          }
          </div>

          <div className="ivs-bottom">
            {timerOn && (
              <div className="ivs-timer" style={{ color: tColor, borderColor: tLeft <= 90 ? 'rgba(224,85,85,.3)' : 'var(--border)' }}>
                {Math.floor(tLeft / 60)
          }:{String(tLeft % 60).padStart(2, '0')}
              </div>
            )}
            <div className="ivs-btn" onClick={function() {
              if (audioOn && window.speechSynthesis) window.speechSynthesis.cancel();
              setAudioOn(function(p) { return !p; });
            }}>
              {audioOn ? 'Audio On' : 'Audio Off'}
            </div>
            <button className='ivs-btn danger' onClick={skip}>Skip Question</button>
          </div>
        </aside>

        <main className="iv-main">
          <div className="iv-topbar">
            <div className="ivt-left">
              <div className={'ivt-dot' + (speaking ? ' speaking' : aiTyping ? ' active' : '')}></div>
              <span className='ivt-status'>
                {speaking ? 'Speaking' : aiTyping ? 'Thinking' : 'Listening'}
              </span>
            </div>
            {curPlan ? <span className='ivt-topic'>{curPlan.area}</span> : null}
          </div>

          <div className='iv-msgs'>
            {msgs.length === 0 && (
              <div className='msgs-empty'>
                <div className='msgs-pulse'></div>
              </div>
            )}
            {msgs.map(function(m, i) {
  if (m.role === 'sys') {
    return (
        <div key = {i} className = 'msg sys'><span className = 'msg-sys-text'>{
            m.content} < /span>
                  </div >);
  }
              return (
                <div key={i} className={'msg' + (m.role === 'you' ? ' you' : '')}>
                  <div className='msg-av'>{m.role === 'ai' ? 'AI' : 'You'}</div>
                  <div className="msg-body">
                    <p className="msg-text">{m.content}</p>
                    <p className='msg-ts'>
                      {m.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            {aiTyping && (
              <div className="typing-row">
                <div className="typing-av">AI</div>
                <div className='typing-bubble'>
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
            <div ref={endR}></div>
          </div>

          {feedback && (
            <div className="iv-fb">
              {feedback.aiDetected ? <p className="fb-ai">{feedback.aiFlagReason}</p> : null}
              <div className='fb-row'>
                <div className='fb-score'>
                  <span className={'fb-num ' + (feedback.totalScore >= 7 ? 'hi' : feedback.totalScore >= 5 ? 'md' : 'lo')}>
                    {feedback.totalScore}
                  </span>
                  <span className="fb-denom">/10</span>
                </div>
                <div className='fb-metrics'>
                  {[
                    { l: 'K', k: feedback.knowledgeScore },
                    { l: 'C', k: feedback.confidenceScore },
                    { l: 'R', k: feedback.resumeAlignment },
                    { l: 'D', k: feedback.depth },
                  ].map(function(m, i) {
                    return (
                      <div key={i} className='fb-metric'>
                        <span>{m.l}</span>
                        <div className="fb-bar">
                          <div className="fb-fill" style={{ width: (m.k * 10) + '%' }}></div>
                        </div>
                        <span className="fb-val">{m.k}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="fb-text">
                <p className="fb-main">{feedback.feedback}</p>
                {feedback.strengths ? <p className='fb-good'>{feedback.strengths}</p> : null}
                {feedback.improvement ? <p className="fb-tip">{feedback.improvement}</p> : null}
              </div>
              {feedback.resources && feedback.resources.length > 0 && (
                <div className="fb-links">
                  {feedback.resources.map(function(r, i) {
                    return <a key={i} href={r.url} target="_blank" rel="noreferrer">{r.title}</a>;
                  })}
                </div>
              )}
              <button className="fb-next" onClick={goNext}>
                {step < TOTAL_QUESTIONS ? 'Next Question' : 'View Results'}
              </button>
            </div>
          )}

          {!feedback && started && (
            <div className="iv-input">
              {speaking && (
                <div className="speak-bar">
                  <div className="speak-waves">
                    <span></span><span></span><span></span><span></span><span></span>
                  </div>
                  <span className="speak-lbl">Speaking</span>
                  <button className='speak-stop' onClick={stopSpeak}>Stop</button>
                </div>
              )}
              <div className={'voice-wrap' + (listening ? ' rec' : '')}>
                <div
          ref = {editR} className = 'voice-field'
                  contentEditable={!listening}
                  suppressContentEditableWarning={true}
                  onInput={
  function(e) {
    setTx(e.currentTarget.textContent);
  }}
                  onPaste={
  function(e) {
    e.preventDefault();
  }}
                  onCopy={
  function(e) {
    e.preventDefault();
  }}
                  onCut={
  function(e) {
    e.preventDefault();
  }}
                  onDrop={
  function(e) {
    e.preventDefault();
  }}
                  onContextMenu={
  function(e) {
    e.preventDefault();
  }}
                  spellCheck={
  false}
                />
                <div className="voice-bar">
                  {!listening ? (
                    <button
                      className={'btn-rec' + (aiTyping || speaking ? ' off' : '')}
                      onClick={aiTyping || speaking ? undefined : startRec}
                    >
                      <span className="rec-dot"></span>
                      {hasAns ? 'Continue' : 'Record'}
                    </button>
                  ) : (
                    <button className="btn-rec on" onClick={stopRec}>
                      <span className="rec-dot"></span>
                      Stop
                    </button>
                  )}
                  {hasAns && !listening ? (
                    <button className="btn-action" onClick={clearAns}>Clear</button>
                  ) : null}
                  {
                    hasAns && !listening ? (< button
                      className={'btn-action primary' + (aiTyping ? ' off' : '')}
                      onClick={aiTyping ? undefined : submitAnswer}
                    >
                      Submit
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="input-hint">
                {listening ? 'Recording - press Stop when finished' : hasAns ? 'Edit if needed, then Submit' : 'Voice input only'}
              </p>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="land">
      <div className="land-box">
        <div className="land-head a0">
          <div className="land-brand">
            <div className="land-logo">
              <svg viewBox="0 0 16 16"><path d="M4 8h8M8 4v8" strokeLinecap="round"/></svg>
            </div>
            <h1 className='land-title'>AI Interviewer</h1>
          </div>
        </div>

        <div className="land-controls a1">
          <div className="ctrl-card">
            <label className="ctrl-upload" htmlFor="file-in">
              <div className={'ctrl-upload-icon' + (upState === 'ready' ? ' ok' : upState === 'fail' ? ' err' : '')}>
                {upState === 'ready' ? (
                  <svg viewBox="0 0 16 16"><path d="M3 8l4 4 6-6"/></svg>
                ) : upState === 'fail' ? (
                  <svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>
                ) : upState === 'uploading' ? (
                  <span className="spin" style={{ fontSize: '13px', color: 'var(--ink3)' }}>o</span>
                ) : (
                  <svg viewBox='0 0 16 16'><path d='M8 11V5M5 7l3-3 3 3M4 13h8'/></svg>
                )}
              </div>
              <div className='ctrl-upload-text'>
                <span className={'ctrl-upload-main' + (upState === 'ready' ? ' ok' : upState === 'fail' ? ' err' : upState === 'idle' ? ' dim' : '')}>
                  {upState === 'uploading' ? 'Uploading...'
                    : upState === 'ready'   ? 'Resume uploaded'
                    : upState === 'fail'    ? 'Upload failed'
                    : 'Upload Resume'}
                </span>
                <span className="ctrl-upload-sub">.docx format</span>
              </div>
              <span className="ctrl-upload-arrow">&#8599;</span>
            </label>
            <input id="file-in" type="file" accept=".docx" onChange={handleFile} style={{ display: 'none' }} />
          </div>

          <div className="ctrl-card a2">
            <div className="ctrl-head">
              <span className="label">Level</span>
            </div>
            <div className="ctrl-body">
              <div className="seg">
                {LEVELS.map(function(l) {
                  return (
                    <button key={l.id} className={'seg-btn' + (level === l.id ? ' on' : '')} onClick={function() { setLevel(l.id); }}>
                      {l.label}
                    </button>
                  );
                  })
                  }
              </div>
            </div>
          </div>

          <div className="ctrl-card a3">
            <div className="ctrl-head">
              <span className="label">Type</span>
            </div>
            <div className="ctrl-body">
              <div className="seg">
                {['Technical', 'HR'].map(function(t) {
                  return (
                    <button key={t} className={'seg-btn' + (itype === t ? ' on' : '')} onClick={function() { setItype(t); }}>
                      {t}
                    </button>
                  );
              })
              }
              </div>
            </div>
          </div>

          <div className="ctrl-card a3">
            <div className="ctrl-head">
              <span className="label">Difficulty</span>
            </div>
            <div className="ctrl-body">
              <div className="seg">
                {['Easy', 'Medium', 'Hard'].map(function(d) {
                  return (
                    <button key={d} className={'seg-btn' + (diff === d ? ' on' : '')} onClick={function() { setDiff(d); }}>
                      {d}
                    </button>
                  );
              })
              }
              </div>
            </div></div>
        </div>

                  < button
              className =
                  {'land-cta a4' +
                   (upState === 'ready' && !analysing ?
                        '' :
                        ' off')} onClick = {analyse} >
                  {analysing ? 'Analysing Resume...' : 'Begin Interview'} <
                  /button>

        {analysing ? <p className="land-status a5">Reading your resume</p >: null
              }
      </div>
    </div>
  );
      }