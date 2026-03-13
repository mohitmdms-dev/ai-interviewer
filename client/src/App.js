import './App.css';

import axios from 'axios';
import {jsPDF} from 'jspdf';
import React, {useCallback, useEffect, useRef, useState} from 'react';

const TOTAL_QUESTIONS = 5;
const TIME_PER_QUESTION = 420;
const GD_TIME = 600;
const STRESS_TIME = 480;
const BASE = 'http://localhost:5000';

const LEVELS = [
  {id: 'junior', label: 'Junior'},
  {id: 'mid', label: 'Mid'},
  {id: 'senior', label: 'Senior'},
];

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
    {name: 'Arjun', stance: 'strongly in favour of'},
    {name: 'Priya', stance: 'strongly against'},
    {name: 'Rohan', stance: 'neutral but analytical about'},
  ],
  [
    {name: 'Meera', stance: 'passionately in favour of'},
    {name: 'Karan', stance: 'sceptical of'},
    {name: 'Ananya', stance: 'presenting a middle ground on'},
  ],
  [
    {name: 'Vikram', stance: 'firmly against'},
    {name: 'Divya', stance: 'enthusiastically supporting'},
    {name: 'Rahul', stance: 'raising practical concerns about'},
  ],
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

var FILLERS = [
  'um',        'uh',           'er',      'ah',        'like',
  'basically', 'you know',     'sort of', 'kind of',   'right',
  'okay so',   'so basically', 'i mean',  'literally', 'actually',
  'honestly',  'obviously',    'clearly', 'just',      'anyway'
];

function detectFillers(text) {
  if (!text) return {count: 0, words: ''};
  var lower = text.toLowerCase();
  var found = {};
  FILLERS.forEach(function(f) {
    var re = new RegExp('\\b' + f.replace(' ', '\\s+') + '\\b', 'gi');
    var matches = lower.match(re);
    if (matches && matches.length > 0) found[f] = matches.length;
  });
  var total = Object.values(found).reduce(function(a, b) {
    return a + b;
  }, 0);
  var words = Object.keys(found)
                  .map(function(k) {
                    return k + ' x' + found[k];
                  })
                  .join(', ');
  return {count: total, words: words};
}

function pickVoice() {
  var vs = window.speechSynthesis.getVoices();
  return (vs.find(function(v) {
    return v.name === 'Google UK English Female';
  }) || vs.find(function(v) {
    return v.name === 'Google US English Female';
  }) || vs.find(function(v) {
    return v.name === 'Microsoft Zira - English (United States)';
  }) || vs.find(function(v) {
    return v.name === 'Microsoft Susan - English (Great Britain)';
  }) || vs.find(function(v) {
    return /samantha/i.test(v.name);
  }) || vs.find(function(v) {
    return /karen/i.test(v.name);
  }) || vs.find(function(v) {
    return /female/i.test(v.name) && v.lang.indexOf('en') === 0;
  }) || vs.find(function(v) {
    return v.lang === 'en-GB' && !v.localService;
  }) || vs.find(function(v) {
    return v.lang === 'en-US' && !v.localService;
  }) || vs.find(function(v) {
    return v.lang.indexOf('en') === 0;
  }) || null);
}

function cleanForSpeech(text) {
  return text.replace(/[*_`#>~]/g, '')
      .replace(
          /\b(e\.g\.|i\.e\.|etc\.|vs\.)/gi,
          function(m) {
            return m.replace(/\./g, '');
          })
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[\[\]{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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
    var clean = cleanForSpeech(text);
    if (!clean) {
      if (onDone) onDone();
      resolve();
      return;
    }

    var chunks = (clean.match(/[^.!?;:]+[.!?;:]+|[^.!?;:]+$/g) || [clean])
                     .map(function(c) {
                       return c.trim();
                     })
                     .filter(function(c) {
                       return c.length > 1;
                     });

    var voice = pickVoice();
    var idx = 0;
    var cancelled = false;
    var keepAliveTimer = null;

    function keepAlive() {
      if (cancelled || !s.speaking) return;
      s.pause();
      s.resume();
      keepAliveTimer = setTimeout(keepAlive, 10000);
    }

    function done() {
      cancelled = true;
      clearTimeout(keepAliveTimer);
      if (onDone) onDone();
      resolve();
    }

    function next() {
      if (cancelled) return;
      if (idx >= chunks.length) {
        done();
        return;
      }
      var chunk = chunks[idx++];
      var u = new SpeechSynthesisUtterance(chunk);
      if (voice) u.voice = voice;
      u.rate = 0.92;
      u.pitch = 1.0;
      u.volume = 1.0;
      u.onend = function() {
        clearTimeout(keepAliveTimer);
        setTimeout(next, 80);
      };
      u.onerror = function(e) {
        clearTimeout(keepAliveTimer);
        if (e.error === 'interrupted' || e.error === 'canceled') {
          done();
          return;
        }
        setTimeout(next, 80);
      };
      s.speak(u);
      keepAliveTimer = setTimeout(keepAlive, 10000);
    }
    next();
  });
}

var ACCENT_LANGS = ['en-IN', 'en-GB', 'en-US'];

function scoreAlternatives(results) {
  var best = '';
  var bestConf = -1;
  for (var i = 0; i < results.length; i++) {
    var alt = results[i];
    var conf = (alt.confidence === 0) ? 0.5 : alt.confidence;
    if (conf > bestConf) {
      bestConf = conf;
      best = alt.transcript;
    }
  }
  return {text: best, confidence: bestConf};
}

function cleanTranscript(t) {
  return t.replace(/\s+/g, ' ')
      .replace(/^[,\.\s]+/, '')
      .replace(/\bi\b/g, 'I')
      .replace(
          /(\. )([a-z])/g,
          function(_, dot, ch) {
            return dot + ch.toUpperCase();
          })
      .trim();
}

function useContinuousVoice(onChange) {
  var active = useRef(false);
  var rec = useRef(null);
  var committed = useRef('');
  var retryT = useRef(null);
  var silenceT = useRef(null);
  var langIdx = useRef(0);
  var cbRef = useRef(onChange);
  var lastFinal = useRef('');

  useEffect(function() {
    cbRef.current = onChange;
  }, [onChange]);

  var start = useCallback(function() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Voice input requires Chrome or Edge.');
      return;
    }
    active.current = true;
    committed.current = '';
    lastFinal.current = '';
    langIdx.current = 0;
    clearTimeout(retryT.current);
    clearTimeout(silenceT.current);

    function boot() {
      if (!active.current) return;
      try {
        var r = new SR();
        rec.current = r;
        r.lang = ACCENT_LANGS[langIdx.current % ACCENT_LANGS.length];
        r.continuous = true;
        r.interimResults = true;
        r.maxAlternatives = 3;

        r.onresult = function(e) {
          clearTimeout(silenceT.current);
          var finals = '';
          var interim = '';

          for (var i = e.resultIndex; i < e.results.length; i++) {
            var result = e.results[i];
            if (result.isFinal) {
              var picked = scoreAlternatives(result);
              if (picked.confidence > 0.08 && picked.text.trim().length > 0) {
                var seg = picked.text.trim();
                if (seg !== lastFinal.current.trim()) {
                  finals += seg + ' ';
                  lastFinal.current = seg;
                }
              }
            } else {
              interim += result[0].transcript;
            }
          }

          if (finals) {
            committed.current =
                cleanTranscript(committed.current + ' ' + finals);
          }
          var display = cleanTranscript(
              committed.current + (interim ? ' ' + interim : ''));
          cbRef.current(display);

          silenceT.current = setTimeout(function() {
            if (!active.current) return;
          }, 8000);
        };

        r.onend = function() {
          if (!active.current) return;
          retryT.current = setTimeout(boot, 100);
        };

        r.onerror = function(ev) {
          if (!active.current) return;
          if (ev.error === 'aborted') return;
          if (ev.error === 'not-allowed' ||
              ev.error === 'service-not-allowed') {
            alert(
                'Microphone access denied. Please allow microphone and reload.');
            active.current = false;
            return;
          }
          if (ev.error === 'no-speech') {
            langIdx.current++;
            retryT.current = setTimeout(boot, 200);
            return;
          }
          retryT.current = setTimeout(boot, ev.error === 'network' ? 600 : 180);
        };

        r.start();
      } catch (err) {
        retryT.current = setTimeout(boot, 300);
      }
    }
    boot();
  }, []);

  var stop = useCallback(function() {
    active.current = false;
    clearTimeout(retryT.current);
    clearTimeout(silenceT.current);
    try {
      if (rec.current) {
        rec.current.onend = null;
        rec.current.onerror = null;
        rec.current.onresult = null;
        rec.current.stop();
      }
    } catch (e) {
    }
    var result = committed.current.trim();
    committed.current = '';
    lastFinal.current = '';
    return result;
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

  var sa0 = useState('Technical');
  var gdMode = sa0[0];
  var setGdMode = sa0[1];
  var sa1 = useState(GD_TOPICS[0]);
  var gdTopic = sa1[0];
  var setGdTopic = sa1[1];
  var sa2 = useState(false);
  var gdCustom = sa2[0];
  var setGdCustom = sa2[1];
  var sa3 = useState('');
  var gdCustomT = sa3[0];
  var setGdCustomT = sa3[1];
  var sa4 = useState([]);
  var gdMsgs = sa4[0];
  var setGdMsgs = sa4[1];
  var sa5 = useState(null);
  var gdResult = sa5[0];
  var setGdResult = sa5[1];
  var sa6 = useState(false);
  var gdTyping = sa6[0];
  var setGdTyping = sa6[1];
  var sa7 = useState(GD_TIME);
  var gdTLeft = sa7[0];
  var setGdTLeft = sa7[1];
  var sa8 = useState(false);
  var gdTimerOn = sa8[0];
  var setGdTimerOn = sa8[1];
  var sa9 = useState(false);
  var gdDone = sa9[0];
  var setGdDone = sa9[1];
  var sc0 = useState(false);
  var gdSpk = sc0[0];
  var setGdSpk = sc0[1];
  var sb0 = useState([]);
  var stressMsgs = sb0[0];
  var setStressMsgs = sb0[1];
  var sb1 = useState(null);
  var stressRes = sb1[0];
  var setStressRes = sb1[1];
  var sb2 = useState(false);
  var stressTyp = sb2[0];
  var setStressTyp = sb2[1];
  var sb3 = useState(STRESS_TIME);
  var sTLeft = sb3[0];
  var setSTLeft = sb3[1];
  var sb4 = useState(false);
  var sTimerOn = sb4[0];
  var setSTimerOn = sb4[1];
  var sb5 = useState(false);
  var stressDone = sb5[0];
  var setStressDone = sb5[1];
  var sb6 = useState(false);
  var stressSpk = sb6[0];
  var setStressSpk = sb6[1];

  var pendingR = useRef(false);
  var audioR = useRef(true);
  var timerR = useRef(null);
  var gdTimerR = useRef(null);
  var sTimerR = useRef(null);
  var endR = useRef(null);
  var gdEndR = useRef(null);
  var sEndR = useRef(null);
  var editR = useRef(null);
  var gdEditR = useRef(null);
  var sEditR = useRef(null);
  var plansR = useRef([]);
  var stepR = useRef(0);
  var cvR = useRef([]);
  var gdCvR = useRef([]);
  var sCvR = useRef([]);
  var gdSidR = useRef('');
  var sSidR = useRef('');
  var gdPersonasR = useRef([]);
  var fillerDataR = useRef({count: 0, words: ''});

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
    if (gdEndR.current) gdEndR.current.scrollIntoView({behavior: 'smooth'});
  }, [gdMsgs, gdTyping]);
  useEffect(function() {
    if (sEndR.current) sEndR.current.scrollIntoView({behavior: 'smooth'});
  }, [stressMsgs, stressTyp]);
  useEffect(function() {
    var s = window.speechSynthesis;
    if (!s) return;
    function loadVoices() {
      var vs = s.getVoices();
      if (vs.length === 0) {
        setTimeout(loadVoices, 100);
      }
    }
    loadVoices();
    s.addEventListener('voiceschanged', function() {
      s.getVoices();
    });
  }, []);

  var addMsg = useCallback(function(role, content) {
    setMsgs(function(p) {
      return p.concat([{role: role, content: content, ts: new Date()}]);
    });
  }, []);

  var addGdMsg = useCallback(function(role, content) {
    setGdMsgs(function(p) {
      return p.concat([{role: role, content: content, ts: new Date()}]);
    });
  }, []);

  var addStressMsg = useCallback(function(role, content) {
    setStressMsgs(function(p) {
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
    addMsg('sys', 'Evaluating your answer...');
    var s = stepR.current;
    var pl = plansR.current[s - 1];
    var cv = cvR.current.slice();
    var fd = fillerDataR.current;
    fillerDataR.current = {count: 0, words: ''};
    try {
      var res = await axios.post(BASE + '/grade', {
        conversation: cv,
        questionNumber: s,
        type: itype,
        difficulty: diff,
        level: level,
        area: (pl && pl.area) || '',
        angle: (pl && pl.angle) || '',
        fillerCount: fd.count,
        fillerWords: fd.words,
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

  useEffect(function() {
    if (gdTimerOn && gdTLeft > 0) {
      gdTimerR.current = setTimeout(function() {
        setGdTLeft(function(t) {
          return t - 1;
        });
      }, 1000);
    } else if (gdTLeft === 0 && gdTimerOn) {
      setGdTimerOn(false);
      doGdGrade();
    }
    return function() {
      clearTimeout(gdTimerR.current);
    };
  }, [gdTimerOn, gdTLeft]);

  useEffect(function() {
    if (sTimerOn && sTLeft > 0) {
      sTimerR.current = setTimeout(function() {
        setSTLeft(function(t) {
          return t - 1;
        });
      }, 1000);
    } else if (sTLeft === 0 && sTimerOn) {
      setSTimerOn(false);
      doStressGrade();
    }
    return function() {
      clearTimeout(sTimerR.current);
    };
  }, [sTimerOn, sTLeft]);

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

  var interruptAndRecord = useCallback(function() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeaking(false);
    pendingR.current = false;
    setTx('');
    if (editR.current) editR.current.textContent = '';
    setListening(true);
    vStart();
  }, [vStart]);

  var speakSimple = useCallback(async function(text, setter) {
    if (!audioR.current) return;
    if (setter) setter(true);
    await speakNatural(text, {
      onDone: function() {
        if (setter) setter(false);
      }
    });
  }, []);

  var gdSpeak = useCallback(async function(text) {
    if (!audioR.current) return;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setGdSpk(true);
    await speakNatural(text, {
      onDone: function() {
        setGdSpk(false);
      }
    });
  }, []);

  var gdStopSpeak = useCallback(function() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setGdSpk(false);
  }, []);

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

  var onGdTx = useCallback(function(t) {
    setTx(t);
    if (gdEditR.current && gdEditR.current.textContent !== t) {
      gdEditR.current.textContent = t;
    }
  }, []);

  var onStressTx = useCallback(function(t) {
    setTx(t);
    if (sEditR.current && sEditR.current.textContent !== t) {
      sEditR.current.textContent = t;
    }
  }, []);

  var voiceHook = useContinuousVoice(onTx);
  var gdVoice = useContinuousVoice(onGdTx);
  var stressVoice = useContinuousVoice(onStressTx);
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
    var fd = detectFillers(raw);
    fillerDataR.current = {
      count: fillerDataR.current.count + fd.count,
      words: fillerDataR.current.words ?
          fillerDataR.current.words + ', ' + fd.words :
          fd.words,
    };
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

  var startGd = useCallback(async function() {
    var topic = gdCustom && gdCustomT.trim() ? gdCustomT.trim() : gdTopic;
    var personas = GD_PERSONAS[Math.floor(Math.random() * GD_PERSONAS.length)];
    var newSid = uid();
    gdSidR.current = newSid;
    gdPersonasR.current = personas;
    gdCvR.current = [];
    setGdMsgs([]);
    setGdResult(null);
    setGdDone(false);
    setGdTLeft(GD_TIME);
    setGdTyping(true);
    setScreen('gd');
    try {
      var res = await axios.post(BASE + '/gd-start', {
        topic: topic,
        sessionId: newSid,
        personas: personas,
      });
      setGdTyping(false);
      addGdMsg('panel', res.data.message);
      gdCvR.current = [{role: 'assistant', content: res.data.message}];
      setGdTimerOn(true);
      gdSpeak(res.data.message);
    } catch (err) {
      setGdTyping(false);
      addGdMsg('sys', 'Connection error starting GD.');
    }
  }, [gdCustom, gdCustomT, gdTopic, addGdMsg, gdSpeak]);

  var submitGdAnswer = useCallback(async function() {
    var raw = ((gdEditR.current && gdEditR.current.textContent) || tx).trim();
    if (!raw || gdTyping || gdDone) return;
    gdVoice.stop();
    setListening(false);
    setTx('');
    if (gdEditR.current) gdEditR.current.textContent = '';
    addGdMsg('you', raw);
    gdCvR.current = gdCvR.current.concat([{role: 'user', content: raw}]);
    setGdTyping(true);
    try {
      var res = await axios.post(BASE + '/gd-chat', {
        message: raw,
        sessionId: gdSidR.current,
      });
      setGdTyping(false);
      if (res.data.message) {
        addGdMsg('panel', res.data.message);
        gdCvR.current = gdCvR.current.concat(
            [{role: 'assistant', content: res.data.message}]);
        gdSpeak(res.data.message);
        if (res.data.isComplete) {
          setGdTimerOn(false);
          setGdDone(true);
          doGdGrade();
        }
      }
    } catch (err) {
      setGdTyping(false);
      addGdMsg('sys', 'Connection error.');
    }
  }, [tx, gdTyping, gdDone, addGdMsg, gdSpeak, gdVoice]);

  async function doGdGrade() {
    setGdTimerOn(false);
    clearTimeout(gdTimerR.current);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setGdDone(true);
    addGdMsg('sys', 'Evaluating your GD performance...');
    var topic = gdCustom && gdCustomT.trim() ? gdCustomT.trim() : gdTopic;
    try {
      var res = await axios.post(BASE + '/gd-grade', {
        conversation: gdCvR.current,
        topic: topic,
        level: level,
      });
      setGdResult(res.data.data);
    } catch (err) {
      addGdMsg('sys', 'Error evaluating GD.');
    }
  }

  var startStress = useCallback(async function() {
    var newSid = uid();
    sSidR.current = newSid;
    sCvR.current = [];
    setStressMsgs([]);
    setStressRes(null);
    setStressDone(false);
    setSTLeft(STRESS_TIME);
    setStressTyp(true);
    setStressSpk(false);
    setScreen('stress');
    try {
      var res = await axios.post(BASE + '/stress-start', {
        sessionId: newSid,
        level: level,
      });
      setStressTyp(false);
      addStressMsg('ai', res.data.message);
      sCvR.current = [{role: 'assistant', content: res.data.message}];
      setSTimerOn(true);
      speakSimple(res.data.message, setStressSpk);
    } catch (err) {
      setStressTyp(false);
      addStressMsg('sys', 'Connection error starting stress interview.');
    }
  }, [level, addStressMsg, speakSimple]);

  var submitStressAnswer = useCallback(async function() {
    var raw = ((sEditR.current && sEditR.current.textContent) || tx).trim();
    if (!raw || stressTyp || stressDone) return;
    stressVoice.stop();
    setListening(false);
    setTx('');
    if (sEditR.current) sEditR.current.textContent = '';
    addStressMsg('you', raw);
    sCvR.current = sCvR.current.concat([{role: 'user', content: raw}]);
    setStressTyp(true);
    try {
      var res = await axios.post(BASE + '/stress-chat', {
        message: raw,
        sessionId: sSidR.current,
      });
      setStressTyp(false);
      if (res.data.message) {
        addStressMsg('ai', res.data.message);
        sCvR.current = sCvR.current.concat(
            [{role: 'assistant', content: res.data.message}]);
        speakSimple(res.data.message, setStressSpk);
        if (res.data.isComplete) {
          setSTimerOn(false);
          setStressDone(true);
          doStressGrade();
        }
      }
    } catch (err) {
      setStressTyp(false);
      addStressMsg('sys', 'Connection error.');
    }
  }, [tx, stressTyp, stressDone, addStressMsg, speakSimple, stressVoice]);

  async function doStressGrade() {
    setSTimerOn(false);
    clearTimeout(sTimerR.current);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setStressDone(true);
    addStressMsg('sys', 'Evaluating your composure...');
    try {
      var res = await axios.post(BASE + '/stress-grade', {
        conversation: sCvR.current,
        level: level,
      });
      setStressRes(res.data.data);
    } catch (err) {
      addStressMsg('sys', 'Error evaluating performance.');
    }
  }

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
  var gdTColor = gdTLeft > 300 ? 'var(--ink)' :
      gdTLeft > 90             ? '#f0a030' :
                                 'var(--red)';
  var sTColor = sTLeft > 240 ? 'var(--ink)' :
      sTLeft > 90            ? '#f0a030' :
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
  var hasGdAns =
      ((gdEditR.current && gdEditR.current.textContent) || tx).trim().length >
      0;
  var hasSAns =
      ((sEditR.current && sEditR.current.textContent) || tx).trim().length > 0;
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
            </div> {
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
          <div key = {i} className = 'msg sys'>
          <span className = 'msg-sys-text'>{m.content} <
          /span>
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
                    { l: 'Knowledge', k: feedback.knowledgeScore },
                    { l: 'Confidence', k: feedback.confidenceScore },
                    { l: 'Relevance', k: feedback.resumeAlignment },
                    { l: 'Depth', k: feedback.depth },
                  ].map(function(m, i) {
    return (
        <div key = {i} className = 'fb-metric'><span>{m.l} <
        /span>
                        <div className="fb-bar">
                          <div className="fb-fill" style={{ width: (m.k * 10) + '%' }}></div >
        </div>
                        <span className="fb-val">{m.k}</span>
        </div>
                    );
                  })}
                </div>
        </div>
              {feedback.fillerCount > 0 && (
                <div className={'fb-filler' + (feedback.fillerCount >= 5 ? ' hi' : '')}>
                  <span className="fb-filler-icon">!</span>
        <span className = 'fb-filler-text'>{feedback.fillerCount} filler word{
            feedback.fillerCount !== 1 ? 's' : ''} detected:
            {feedback.fillerWords} < /span>
                </div >)}
              <div className='fb-text'>
                <p className='fb-main'>{feedback.feedback}</p>
                {feedback.strengths ? <p className="fb-good">{feedback.strengths}</p> : null}
                {feedback.improvement ? <p className='fb-tip'>{feedback.improvement}</p> : null}
              </div>
              {feedback.resources && feedback.resources.length > 0 && (
                <div className='fb-links'>
                  {feedback.resources.map(function(r, i) {
                    return <a key={i} href={r.url} target='_blank' rel='noreferrer'>{r.title}</a>;
                  })}
                </div>
              )}
              <button className='fb-next' onClick={goNext}>
                {step < TOTAL_QUESTIONS ? 'Next Question' : 'View Results'}
              </button>
            </div>
          )}

          {!feedback && started && (
            <div className='iv-input'>
              {speaking && !listening && (
                <div className='speak-bar interrupt-bar'>
                  <div className='speak-waves'>
                    <span></span><span></span><span></span><span></span><span></span>
                  </div>
                  <div className='speak-bar-left'>
                    <span className='speak-lbl'>AI is speaking</span>
                    <span className="speak-hint">Interrupt to answer now</span>
                  </div>
                  <div className="speak-bar-btns">
                    <button className="btn-interrupt" onClick={interruptAndRecord}>
                      <span className="rec-dot"></span>
                      Answer Now
                    </button>
                    <button className="speak-stop" onClick={stopSpeak}>Skip</button>
                  </div>
                </div>
              )}
              {(!speaking || listening) && (
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
                        className={'btn-rec' + (aiTyping ? ' off' : '')}
                        onClick={aiTyping ? undefined : startRec}
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
              )}
              <p className="input-hint">
                {speaking && !listening ? 'Press Answer Now to interrupt and respond immediately'
                  : listening ? 'Recording - press Stop when finished'
                  : hasAns ? 'Edit if needed, then Submit'
                  : aiTyping ? 'AI is thinking...'
                  : 'Press Record to start your answer'}
              </p>
            </div>
          )}
        </main>
      </div>
    );
  }

  if (screen === 'gd') {
    var activeTopic = gdCustom && gdCustomT.trim() ? gdCustomT.trim() : gdTopic;
    return (
      <div className="iv">
        <aside className="iv-side gd-side">
          <div className="ivs-brand">
            <div className="ivs-logo gd-logo">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <circle cx="4" cy="4" r="2"/>
                <circle cx='9' cy='4' r='2'/>
                <path d='M1 11c0-2 1.5-3 3-3h4c1.5 0 3 1 3 3'/>
              </svg>
            </div>
            <span className='ivs-name'>Group Discussion</span>
          </div>

          <div className='gd-topic-card'>
            <p className='gd-topic-label'>Topic</p>
            <p className="gd-topic-text">{activeTopic}</p>
          </div>

          <div className="gd-personas">
            <p className="gd-personas-label">Participants</p>
            {gdPersonasR.current.map(function(p, i) {
        return (
            <div key = {i} className = 'gd-persona-item'>
            <div className = 'gd-persona-av' style = {
              {
                background: ['#5b9dff', '#6c63ff', '#2ecc71'][i] || '#5b9dff'
              }
            }>{p.name[0]} <
            /div>
                  <div>
                    <span className="gd-persona-name">{p.name}</span >
            <span className = 'gd-persona-stance'>{p.stance} <
            /span>
                  </div >
            </div>
              );
            })}
            <div className="gd-persona-item you-item">
              <div className="gd-persona-av you-av">Y</div>
            <div><span className = 'gd-persona-name'>You<
                /span>
                <span className="gd-persona-stance">Make your case</span>
            </div>
            </div><
            /div>

          <div className="ivs-bottom">
            {gdTimerOn && !gdDone && (
              <div className="ivs-timer" style={{ color: gdTColor }}>
                {Math.floor(gdTLeft /60)}:{String(gdTLeft % 60).padStart(2, '0')}
              </div>
            )}
            {!gdDone && (
              <button className="ivs-btn danger" onClick={function() { setGdTimerOn(false); doGdGrade(); }}>
                End Discussion
              </button>
            )}
          </div>
        </aside>

        <main className='iv-main'>
          <div className='iv-topbar'>
            <div className='ivt-left'>
              <div className={'ivt-dot' + (gdTyping ? ' active' : gdSpk ? ' speaking' : '')}></div>
              <span className="ivt-status gd-status">
                {gdTyping ? 'Panel thinking...' : gdSpk ? 'Panel speaking...' : gdDone ? 'Discussion ended' : 'Your turn to contribute'}
              </span>
            </div>
            <span className="ivt-topic gd-badge">GD Round</span>
          </div>

          <div className="iv-msgs gd-msgs">
            {gdMsgs.map(function(m, i) {
              if (m.role === 'sys') {
                return (
                  <div key={i} className="msg sys">
                    <span className="msg-sys-text">{m.content}</span>
                  </div>
                );
              }
              if (m.role === 'you') {
                return (
                  <div key={i} className="msg you">
                    <div className="msg-av you-av-sm">You</div>
                    <div className='msg-body'>
                      <p className='msg-text'>{m.content}</p>
                      <p className="msg-ts">{m.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                );
              }
              var firstColon = m.content.indexOf(':');
              var speakerName = firstColon > -1 && firstColon < 12 ? m.content.substring(0, firstColon).trim() : 'Panel';
              var speakerText = firstColon > -1 && firstColon < 12 ? m.content.substring(firstColon + 1).trim() : m.content;
              var pIdx = gdPersonasR.current.findIndex(function(p) {
      return p.name === speakerName; });
              var pColor = ['#5b9dff','#6c63ff','#2ecc71'][pIdx] || '#5b9dff';
              return (
                <div key={i} className='msg gd-panel-msg'>
                  <div className='msg-av gd-av' style={{
      background: pColor }}>{speakerName[0]}</div>
                  <div className="msg-body">
                    <p className="msg-speaker">{speakerName}</p>
                    <p className='msg-text'>{speakerText}</p>
                    <p className="msg-ts">{m.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              );
            })}
            {gdTyping && (
              <div className='typing-row'>
                <div className='typing-av'>GD</div>
                <div className="typing-bubble">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
            <div ref={gdEndR}></div>
          </div>

          {
    gdResult &&
        (<div className = 'iv-fb gd-result'>
             <p className = 'gd-result-label'>GD Evaluation<
                 /p>
              <div className="fb-row">
                <div className="fb-score">
                  <span className={'fb-num ' + (gdResult.totalScore >= 7 ? 'hi' : gdResult.totalScore >= 5 ? 'md' : 'lo')}>
                    {gdResult.totalScore}
                  </span><
             span className = 'fb-denom' > /10</span >
             </div>
                <div className="fb-metrics">
                  {[
                    { l: 'Init', k: gdResult.initiationScore },
                    { l: 'Content', k: gdResult.contentScore },
                    { l: 'Lead', k: gdResult.leadershipScore },
                    { l: 'Comm', k: gdResult.communicationScore },
                  ].map(function(m, i) {
                    return (
                      <div key={i} className="fb-metric">
                        <span>{m.l}</span>
             <div className = 'fb-bar'><div className = 'fb-fill' style = {
                                {
                                  width: (m.k * 10) + '%'
                                }
                              }></div>
                        </div>
             <span className = 'fb-val'>{m.k} <
             /span>
                      </div >);
                  })}
                </div>
              </div>
              <div className='fb-text'>
                <p className='fb-main'>{gdResult.feedback}</p>
                {gdResult.strengths ? <p className="fb-good">{gdResult.strengths}</p> : null}
                {gdResult.improvement ? <p className='fb-tip'>{gdResult.improvement}</p> : null}
              </div>
              {gdResult.resources && gdResult.resources.length > 0 && (
                <div className='fb-links'>
                  {gdResult.resources.map(function(r, i) {
                    return <a key={i} href={r.url} target='_blank' rel='noreferrer'>{r.title}</a>;
                  })}
                </div>
              )}
              <button className='fb-next' onClick={restart}>Back to Home</button>
            </div>
          )}

          {!gdResult && !gdDone && (
            <div className='iv-input gd-input'>
              {gdSpk && !listening && (
                <div className='speak-bar interrupt-bar'>
                  <div className='speak-waves'>
                    <span></span><span></span><span></span><span></span><span></span>
                  </div>
                  <div className='speak-bar-left'>
                    <span className='speak-lbl'>Panel is speaking</span>
                    <span className="speak-hint">Interrupt to make your point now</span>
                  </div>
                  <div className="speak-bar-btns">
                    <button className="btn-interrupt" onClick={function() {
                      gdStopSpeak();
                      setTx('');
                      if (gdEditR.current) gdEditR.current.textContent = '';
                      setListening(true);
                      gdVoice.start();
                    }}>
                      <span className="rec-dot"></span>
                      Speak Now
                    </button>
                    <button className="speak-stop" onClick={gdStopSpeak}>Skip</button>
                  </div>
                </div>
              )}
              {(!gdSpk || listening) && (
                <div className={'voice-wrap' + (listening ? ' rec' : '')}>
                  <div
    ref = {gdEditR} className = 'voice-field'
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
                        className={'btn-rec' + (gdTyping ? ' off' : '')}
                        onClick={gdTyping ? undefined : function() { setTx(''); if (gdEditR.current) gdEditR.current.textContent = ''; setListening(true); gdVoice.start(); }}
                      >
                        <span className="rec-dot"></span>
                        {hasGdAns ? 'Continue' : 'Speak'}
                      </button>
                    ) : (
                      <button className="btn-rec on" onClick={function() { gdVoice.stop(); setListening(false); }}>
                        <span className="rec-dot"></span>
                        Stop
                      </button>
                    )}
                    {hasGdAns && !listening ? (
                      <button className="btn-action" onClick={function() { setTx(''); if (gdEditR.current) gdEditR.current.textContent = ''; }}>Clear</button>
                    ) : null}
                    {hasGdAns && !listening ? (
                      <button
                        className={'btn-action primary' + (gdTyping ? ' off' : '')}
                        onClick={gdTyping ? undefined : submitGdAnswer}
                      >
                        Contribute
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
              <p className="input-hint gd-hint">
                {gdSpk && !listening ? 'Press Speak Now to interrupt the panel'
                  : listening ? 'Recording - press Stop when done'
                  : hasGdAns ? 'Edit if needed, then Contribute'
                  : gdTyping ? 'Panel is thinking...'
                  : 'Press Speak to make your point'}
              </p>
            </div>
          )}
        </main>
      </div>
    );
  }

  if (screen === 'stress') {
    return (
      <div className="iv">
        <aside className="iv-side stress-side">
          <div className="ivs-brand">
            <div className="ivs-logo stress-logo">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M6 1v6M6 9v2"/>
                <circle cx='6' cy='6' r='5'/>
              </svg>
            </div>
            <span className='ivs-name'>Stress Interview</span>
          </div>

          <div className='stress-info-card'>
            <p className='stress-info-title'>What to expect</p>
            <ul className="stress-info-list">
              <li>Deliberate interruptions</li>
              <li>Your claims will be challenged</li>
              <li>Silence as a pressure tactic</li>
              <li>Impossible comparisons</li>
              <li>Stay calm. Hold your ground.</li>
            </ul>
          </div>

          <div className='stress-tips'>
            <p className='stress-tip-label'>Tip</p>
            <p className="stress-tip-text">
              Do not apologise or fold under pressure. Acknowledge the challenge calmly and restate your position with evidence.
            </p>
          </div>

          <div className="ivs-bottom">
            {sTimerOn && !stressDone && (
              <div className="ivs-timer" style={{ color: sTColor }}>
                {Math.floor(sTLeft / 60)}:{String(sTLeft % 60).padStart(2, '0')}
              </div>
            )}
            {!stressDone && (
              <button className="ivs-btn danger" onClick={function() { setSTimerOn(false); doStressGrade(); }}>
                End Interview
              </button>
            )}
          </div>
        </aside>

        <main className='iv-main'>
          <div className='iv-topbar'>
            <div className='ivt-left'>
              <div className={'ivt-dot' + (stressSpk ? ' speaking' : stressTyp ? ' active' : '')}></div>
              <span className="ivt-status stress-status">
                {stressTyp ? 'Formulating attack...' : stressDone ? 'Interview ended' : stressSpk ? 'Speaking' : 'Awaiting your response'}
              </span>
            </div>
            <span className="ivt-topic stress-badge">Stress Round</span>
          </div>

          <div className="iv-msgs stress-msgs">
            {stressMsgs.map(function(m, i) {
              if (m.role === 'sys') {
                return (
                  <div key={i} className="msg sys">
                    <span className="msg-sys-text">{m.content}</span>
                  </div>
                );
              }
              return (
                <div key={i} className={'msg' + (m.role === 'you' ? ' you' : ' stress-ai-msg')}>
                  <div className={'msg-av' + (m.role !== 'you' ? ' stress-av' : '')}>
                    {m.role === 'you' ? 'You' : 'IV'}
                  </div>
                  <div className='msg-body'>
                    <p className='msg-text'>{m.content}</p>
                    <p className="msg-ts">{m.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              );
            })}
            {stressTyp && (
              <div className='typing-row'>
                <div className='typing-av stress-av'>IV</div>
                <div className="typing-bubble stress-bubble">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
            <div ref={sEndR}></div>
          </div>

          {
  stressRes &&
      (<div className = 'iv-fb stress-result'>
           <p className = 'stress-result-label'>Composure Report<
               /p>
              <div className="fb-row">
                <div className="fb-score">
                  <span className={'fb-num ' + (stressRes.totalScore >= 7 ? 'hi' : stressRes.totalScore >= 5 ? 'md' : 'lo')}>
                    {stressRes.totalScore}
                  </span><
           span className = 'fb-denom' > /10</span >
           </div>
                <div className="fb-metrics">
                  {[
                    { l: 'Calm', k: stressRes.composureScore },
                    { l: 'Assert', k: stressRes.assertivenessScore },
                    { l: 'Recovery', k: stressRes.recoveryScore },
                    { l: 'Auth', k: stressRes.authenticityScore },
                  ].map(function(m, i) {
                    return (
                      <div key={i} className="fb-metric">
                        <span>{m.l}</span>
           <div className = 'fb-bar'>
           <div className = 'fb-fill stress-fill' style = {
                              {
                                width: (m.k * 10) + '%'
                              }
                            }></div>
                        </div>
           <span className = 'fb-val'>{m.k} <
           /span>
                      </div >);
                  })}
                </div>
              </div>
              <div className='fb-text'>
                <p className='fb-main'>{stressRes.feedback}</p>
                {stressRes.strengths ? <p className="fb-good">{stressRes.strengths}</p> : null
          }
          {stressRes.improvement ? <p className='fb-tip'>{stressRes.improvement}</p> : null}
              </div>
              {stressRes.resources && stressRes.resources.length > 0 && (
                <div className='fb-links'>
                  {stressRes.resources.map(function(r, i) {
                    return <a key={i} href={r.url} target='_blank' rel='noreferrer'>{r.title}</a>;
                  })}
                </div>
              )}
              <button className='fb-next' onClick={restart}>Back to Home</button>
            </div>
          )}

          {!stressRes && !stressDone && (
            <div className='iv-input stress-input'>
              {stressSpk && (
                <div className='speak-bar stress-speak-bar'>
                  <div className='speak-waves'>
                    <span></span><span></span><span></span><span></span><span></span>
                  </div>
                  <span className='speak-lbl'>Speaking</span>
                  <button className="speak-stop" onClick={function() { if (window.speechSynthesis) window.speechSynthesis.cancel(); setStressSpk(false); }}>Stop</button>
                </div>
              )}
              <div className={'voice-wrap' + (listening ? ' rec' : '')}>
                <div
                  ref={sEditR}
                  className="voice-field"
                  contentEditable={!listening}
                  suppressContentEditableWarning={true}
                  onInput={function(e) { setTx(e.currentTarget.textContent); }}
                  onPaste={function(e) { e.preventDefault(); }}
                  onCopy={function(e) { e.preventDefault(); }}
                  onCut={function(e) { e.preventDefault(); }}
                  onDrop={function(e) { e.preventDefault(); }}
                  onContextMenu={function(e) { e.preventDefault(); }}
                  spellCheck={false}
                />
                <div className='voice-bar'>
                  {!listening ? (
                    <button
                      className={'btn-rec' + (stressTyp || stressSpk ? ' off' : '')}
                      onClick={stressTyp || stressSpk ? undefined : function() {
      setTx('');
      if (sEditR.current) sEditR.current.textContent = '';
      setListening(true);
      stressVoice.start(); }}
                    >
                      <span className='rec-dot'></span>
                      {hasSAns ? 'Continue' : 'Respond'}
                    </button>
                  ) : (
                    <button className='btn-rec on' onClick={function() {
      stressVoice.stop();
      setListening(false); }}>
                      <span className='rec-dot'></span>
                      Stop
                    </button>
                  )}
                  {hasSAns && !listening ? (
                    <button className='btn-action' onClick={function() {
      setTx('');
      if (sEditR.current) sEditR.current.textContent = ''; }}>Clear</button>
                  ) : null}
                  {hasSAns && !listening ? (
                    <button
                      className={'btn-action primary' + (stressTyp ? ' off' : '')}
                      onClick={stressTyp ? undefined : submitStressAnswer}
                    >
                      Reply
                    </button>
                  ) : null}
                </div>
              </div>
              <p className='input-hint'>
                {listening ? 'Recording - press Stop when done' : hasSAns ? 'Edit if needed, then Reply' : 'Stay calm and respond'}
              </p>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className='land'>
      <div className='land-box'>
        <div className='land-head a0'>
          <div className='land-brand'>
            <div className='land-logo'>
              <svg viewBox='0 0 16 16'><path d='M4 8h8M8 4v8' strokeLinecap='round'/></svg>
            </div>
            <h1 className='land-title'>AI Interviewer</h1>
          </div>
        </div>

        <div className="land-mode-tabs a0">
          {[
            { id: 'interview', label: 'Interview', icon: '&#128100;', desc: 'One-on-one personalised interview' },
            { id: 'gd',        label: 'Group Discussion', icon: '&#128172;', desc: 'Multi-participant GD round' },
            { id: 'stress',    label: 'Stress Interview', icon: '&#9889;', desc: 'Pressure test your composure' },
          ].map(function(m) {
            var active = gdMode === m.id;
            return (
              <button
                key={m.id}
                className={'mode-tab' + (active ? ' on' : '')}
                onClick={function() { setGdMode(m.id); }}
              >
                <span className="mode-tab-icon" dangerouslySetInnerHTML={{ __html: m.icon }}></span>
                <span className='mode-tab-label'>{m.label}</span>
                <span className="mode-tab-desc">{m.desc}</span>
              </button>
            );
          })}
        </div>

        <div className='land-controls a1'>
          <div className='ctrl-card'>
            <label className='ctrl-upload' htmlFor='file-in'>
              <div className={'ctrl-upload-icon' + (upState === 'ready' ? ' ok' : upState === 'fail' ? ' err' : '')}>
                {
    upState === 'ready' ?
        (<svg viewBox = '0 0 16 16'><path d = 'M3 8l4 4 6-6' />
         </svg>
                ) : upState === 'fail' ? (
                  <svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/>
         </svg>
                ) : upState === 'uploading' ? (
                  <span className="spin" style={{ fontSize: '13px', color: 'var(--ink3)' }}>o</span>) :
        (<svg viewBox = '0 0 16 16'><path d = 'M8 11V5M5 7l3-3 3 3M4 13h8' />
         </svg>
                )}
              </div>
         <div className = 'ctrl-upload-text'>
         <span className =
              {'ctrl-upload-main' +
               (upState === 'ready'    ? ' ok' :
                    upState === 'fail' ? ' err' :
                    upState === 'idle' ? ' dim' :
                                         '')}>{
             upState === 'uploading' ? 'Uploading...' :
                 upState === 'ready' ? 'Resume uploaded' :
                 upState === 'fail'  ? 'Upload failed' :
                                       'Upload Resume'} <
         /span>
                <span className="ctrl-upload-sub">.docx format</span >
         </div>
              <span className="ctrl-upload-arrow">&#8599;</span>
         </label>
            <input id="file-in" type="file" accept=".docx" onChange={handleFile} style={{ display: 'none' }} />
         </div>

          <div className="ctrl-card a2">
            <div className="ctrl-head"><span className="label">Level</span>
         </div>
            <div className="ctrl-body">
              <div className="seg">
                {LEVELS.map(function(l) {
                  return (
                    <button key={l.id} className={'seg-btn' + (level === l.id ? ' on' : '')} onClick={function() { setLevel(l.id); }}>
                      {l.label}
                    </button>);
                })}
              </div>
            </div>
          </div>

          {gdMode === 'interview' && (
            <div className="ctrl-card a3">
              <div className="ctrl-head"><span className="label">Type</span></div>
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
          )}

          {gdMode === 'interview' && (
            <div className="ctrl-card a3">
              <div className="ctrl-head"><span className="label">Difficulty</span></div>
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
              </div><
                    /div>
          )}

          {gdMode === 'gd' && (
            <div className="ctrl-card a3 gd-topic-ctrl">
              <div className="ctrl-head"><span className="label">GD Topic</span>
                    </div>
              <div className="ctrl-body gd-topic-body">
                <div className="gd-topic-toggle">
                  <button className={'seg-btn' + (!gdCustom ? ' on' : '')} onClick={function() { setGdCustom(false); }}>Preset</button>
                    <button className = {
                         'seg-btn' + (gdCustom ? ' on' : '')} onClick = {
                      function() {
                        setGdCustom(true);
                      }
                    }>Custom</button>
                </div> {
                  !gdCustom ? (< select
                  className = 'gd-topic-select'
                  value = {gdTopic} onChange = {
                    function(e) {
                      setGdTopic(e.target.value);
                    }
                  } > {GD_TOPICS.map(function(t, i) {
                      return <option key={i} value={t}>{t}</option>;
                    })}
                  </select>
                ) : (
                  <input
                    className='gd-topic-input'
                    type='text'
                    placeholder='Enter your own GD topic...'
                    value={gdCustomT}
                    onChange={function(e) { setGdCustomT(e.target.value); }}
                    maxLength={120}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {gdMode === 'interview' && (
          <button
            className={'land-cta a4' + (upState === 'ready' && !analysing ? '' : ' off')}
            onClick={analyse}
          >
            {analysing ? 'Analysing Resume...' : 'Begin Interview'}
          </button>
        )}

        {gdMode === 'gd' && (
          <button
            className={'land-cta gd-cta a4' + (upState === 'ready' ? '' : ' off')}
            onClick={startGd}
          >
            Join Group Discussion
          </button>
        )}

        {gdMode === 'stress' && (
          <button
            className={'land-cta stress-cta a4' + (upState === 'ready' ? '' : ' off')}
            onClick={startStress}
          >
            Start Stress Interview
          </button>
        )}

        {gdMode === 'interview' && analysing ? <p className="land-status a5">Reading your resume</p> : null}
        {gdMode !== 'interview' && upState !== 'ready' ? (
          <p className='land-status a5'>Upload your resume first to personalise questions</p>
        ) : null}
      </div>
    </div>
  );
}