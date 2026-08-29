"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QuestionPane from "@/components/QuestionPane";
import SheetPane from "@/components/SheetPane";
import { runPipeline, type Result } from "@/lib/pipeline";
import type { Progress } from "@/lib/types";

/* ── icons ─────────────────────────────────────────────────────── */
const Ico = {
  layers: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  home: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  exam: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  hist: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  chat: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  upload: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
  star: <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
  send: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  dl: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  plus: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
};

const STAGES = ["reading","questions","answers","mapping","grading"] as const;
const STAGE_LABELS:Record<string,string> = {reading:"Reading files",questions:"Extracting questions",answers:"Reading answers",mapping:"Mapping answers",grading:"AI Grading"};

/* ── session history type ───────────────────────────────────────── */
type HistoryEntry = {
  id: string;
  date: string;
  paper: string;
  awarded: number | null;
  max: number | null;
  answered: number;
  total: number;
  overall: string;
  strengths: string[];
  focus: string[];
};

/* ── AI chat message type ───────────────────────────────────────── */
type ChatMsg = { role: "user"|"ai"; text: string };

const SUGGESTIONS = [
  "How did the student perform overall?",
  "Which questions need improvement?",
  "What are the student's strengths?",
  "Give study tips for weak areas",
  "Compare with previous session",
];

export default function Page() {
  const [qFiles, setQF] = useState<File[]>([]);
  const [aFiles, setAF] = useState<File[]>([]);
  const [apiKey, setKey] = useState("");
  const [needsKey, setNeedsKey] = useState(false);
  const [withGrading, setGrade] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [result, setResult] = useState<Result|null>(null);
  const [activeQId, setAQId] = useState<string|null>(null);
  const [activeBlkId, setABId] = useState<string|null>(null);
  const [qOver, setQO] = useState(false);
  const [aOver, setAO] = useState(false);

  // History (persisted in localStorage-like storage via artifact API, or in-memory)
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // AI Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([
    {role:"ai", text:"👋 Hi! I'm your AI teaching assistant. Ask me anything about this student's performance, study tips, or how to help them improve."}
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(()=>{
    fetch("/api/status").then(r=>r.json()).then(s=>setNeedsKey(!s.hasServerKey)).catch(()=>setNeedsKey(true));
    // Load history from localStorage
    try {
      const saved = localStorage.getItem("veda_history");
      if (saved) setHistory(JSON.parse(saved));
    } catch {}
  },[]);

  useEffect(()=>{
    if (chatOpen) setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:"smooth"}),100);
  },[chatMsgs, chatOpen]);

  const canStart = qFiles.length>0 && aFiles.length>0 && (!needsKey||apiKey.trim().length>3);

  const start = async () => {
    setRunning(true); setError(null); setResult(null); setAQId(null);
    try {
      const res = await runPipeline({questionFiles:qFiles, answerFiles:aFiles, apiKey, withGrading, onProgress:setProgress});
      setResult(res);
      setAQId(res.matches[0]?.questionId??null);
      // Save to history
      const entry: HistoryEntry = {
        id: Date.now().toString(),
        date: new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}),
        paper: qFiles[0]?.name?.replace(/\.[^.]+$/,"") ?? "Exam",
        awarded: res.summary.awarded,
        max: res.summary.max,
        answered: res.summary.answered,
        total: res.questions.length,
        overall: res.summary.overall,
        strengths: res.summary.strengths,
        focus: res.summary.focus,
      };
      const newHistory = [entry, ...history].slice(0,10);
      setHistory(newHistory);
      try { localStorage.setItem("veda_history", JSON.stringify(newHistory)); } catch {}
      // Reset chat with context
      setChatMsgs([{role:"ai", text:`✅ Done! I've analysed the script for **${entry.paper}**. ${res.summary.overall || "Ask me anything about the results."}`}]);
    } catch(err) {
      setError(err instanceof Error ? err.message : "Unknown error. Check your API key.");
    } finally { setRunning(false); }
  };

  const reset = () => { setResult(null); setProgress(null); setError(null); setAQId(null); setABId(null); setQF([]); setAF([]); };

  const derived = useMemo(()=>{
    if (!result) return null;
    const matches = new Map(result.matches.map(m=>[m.questionId,m]));
    const grades  = new Map(result.grades.map(g=>[g.questionId,g]));
    const blocks  = new Map(result.blocks.map(b=>[b.id,b]));
    const unmatchedIds = new Set(result.unmatchedBlockIds);
    const unmatched = result.blocks.filter(b=>unmatchedIds.has(b.id)&&b.text.replace(/\u200b/g,"").trim());
    return {matches,grades,blocks,unmatched};
  },[result]);

  const activeBlockIds = useMemo(()=>{
    if (!result||!derived) return [];
    if (activeQId) {
      const m = derived.matches.get(activeQId); if (!m) return [];
      const base = new Set(m.blockIds);
      return result.blocks.filter(b=>base.has(b.id)||[...base].some(id=>b.id.startsWith(`${id}-x`))).map(b=>b.id);
    }
    if (activeBlkId) return [activeBlkId];
    return [];
  },[result,derived,activeQId,activeBlkId]);

  const activeLabel = useMemo(()=>{
    if (!result) return null;
    if (activeQId) return result.questions.find(q=>q.id===activeQId)?.number??null;
    if (activeBlkId) return result.blocks.find(b=>b.id===activeBlkId)?.label??"?";
    return null;
  },[result,activeQId,activeBlkId]);

  const selectQ = (id:string) => { setABId(null); setAQId(c=>c===id?null:id); };
  const selectB = (id:string) => {
    if (!result) return;
    const owner = result.matches.find(m=>m.blockIds.includes(id));
    if (owner) { setABId(null); setAQId(owner.questionId); return; }
    setAQId(null); setABId(c=>c===id?null:id);
  };

  const dropFiles = (setter:(f:File[])=>void) => (e:React.DragEvent) => {
    e.preventDefault();
    const fs = Array.from(e.dataTransfer.files).filter(f=>f.type==="application/pdf"||f.type.startsWith("image/"));
    if (fs.length) setter(fs);
  };

  const fmtSize = (n:number) => n>1e6?`${(n/1e6).toFixed(1)} MB`:`${Math.round(n/1000)} KB`;

  const exportCSV = () => {
    if (!result||!derived) return;
    const rows=[["Question","Number","Status","Awarded","Max","Verdict","Feedback"]];
    for (const q of result.questions) {
      const m=derived.matches.get(q.id); const g=derived.grades.get(q.id);
      rows.push([q.text.slice(0,80),q.number,m?"Answered":"Unanswered",String(g?.awarded??""),String(q.marks??""),g?.verdict??"",g?.feedback??""]);
    }
    const csv=rows.map(r=>r.map(c=>`"${c.replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="veda-marks.csv"; a.click();
  };

  // AI Chat send
  const sendChat = useCallback(async (text?: string) => {
    const msg = (text ?? chatInput).trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    setChatMsgs(prev=>[...prev,{role:"user",text:msg}]);
    setChatLoading(true);

    try {
      // Build context from result
      const ctx = result ? `
Current exam results:
- Paper: ${qFiles[0]?.name ?? "Unknown"}
- Score: ${result.summary.awarded ?? "N/A"} / ${result.summary.max ?? "N/A"}
- Answered: ${result.summary.answered} of ${result.questions.length} questions
- Overall: ${result.summary.overall}
- Strengths: ${result.summary.strengths.join(", ") || "None noted"}
- Areas to improve: ${result.summary.focus.join(", ") || "None noted"}
- Questions: ${result.questions.map(q=>{
  const g = result.grades.find(g=>g.questionId===q.id);
  return `Q${q.number}: ${g?.verdict??'not graded'} (${g?.awarded??'-'}/${q.marks??'-'})`;
}).join("; ")}
${history.length>1?`\nPrevious session: ${history[1].paper}, score ${history[1].awarded}/${history[1].max}`:""}
` : "No exam data loaded yet.";

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? {"x-gemini-key": apiKey} : {}),
        },
        body: JSON.stringify({ message: msg, context: ctx }),
      });

      if (!res.ok) {
        const err = await res.json().catch(()=>({error:"Chat failed"}));
        throw new Error(err.error || "Chat failed");
      }

      const data = await res.json() as {reply: string};
      setChatMsgs(prev=>[...prev,{role:"ai",text:data.reply}]);
    } catch(err) {
      setChatMsgs(prev=>[...prev,{role:"ai",text:`Sorry, I hit an error: ${err instanceof Error?err.message:"Unknown error"}. Please try again.`}]);
    } finally { setChatLoading(false); }
  },[chatInput, chatLoading, result, history, apiKey, qFiles]);

  const curStageIdx = progress ? STAGES.indexOf(progress.stage as typeof STAGES[number]) : -1;

  /* ── Sidebar ────────────────────────────────────────────────── */
  const Sidebar = () => (
    <aside className="vd-sidebar">
      <div className="vd-sidebar-logo">
        <div className="vd-logo-mark">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div>
          <div className="vd-logo-text">VedaAI</div>
          <div className="vd-logo-sub">Marking Desk</div>
        </div>
      </div>

      <button className="vd-ai-btn" onClick={()=>setChatOpen(true)}>
        {Ico.chat} Ask AI Teacher
        <span className="vd-ai-btn-dot"/>
      </button>

      <p className="vd-nav-section">Navigation</p>
      <ul className="vd-nav">
        <li className="vd-nav-item" onClick={result?reset:undefined} style={{cursor:result?"pointer":"default",opacity:result?1:.6}}>
          {Ico.home} Home {result&&<span style={{marginLeft:"auto",fontSize:9,opacity:.5}}>← back</span>}
        </li>
        <li className="vd-nav-item active">{Ico.exam} Marking Desk <span className="vd-nav-badge">Live</span></li>
        <li className="vd-nav-item" style={{opacity:.5,cursor:"default"}}>{Ico.hist} History</li>
      </ul>

      <div style={{flex:1}}/>
      <div className="vd-sidebar-footer">
        <div className="vd-user-avatar">S</div>
        <div className="vd-user-info">
          <div className="vd-user-name">Sanjay P.</div>
          <div className="vd-user-role">Teacher · VIT</div>
        </div>
      </div>
    </aside>
  );

  /* ── Topbar ───────────────────────────────────────────────── */
  const Topbar = () => (
    <div className="vd-topbar">
      <span className="vd-topbar-title">
        {Ico.layers}
        Marking Desk
        {result&&<span className="vd-topbar-crumb">· {result.questions.length} questions · {result.matches.length} answered</span>}
      </span>
      {result&&<>
        <button className="vd-topbar-btn ghost" onClick={exportCSV}>{Ico.dl} Export</button>
        <button className="vd-topbar-btn primary" onClick={()=>setChatOpen(true)}>{Ico.chat} Ask AI</button>
        <button className="vd-topbar-btn ghost" onClick={reset}>{Ico.plus} New</button>
      </>}
    </div>
  );

  /* ── AI Chat Modal ─────────────────────────────────────────── */
  const ChatModal = () => (
    <div className="vd-chat-overlay" onClick={e=>{if(e.target===e.currentTarget)setChatOpen(false);}}>
      <div className="vd-chat-panel">
        <div className="vd-chat-head">
          <div className="vd-chat-head-icon">🧑‍🏫</div>
          <div>
            <div className="vd-chat-head-title">AI Teacher Assistant</div>
            <div className="vd-chat-head-sub">Powered by Gemini · Always available</div>
          </div>
          <button className="vd-chat-close" onClick={()=>setChatOpen(false)}>✕</button>
        </div>

        <div className="vd-chat-messages">
          {chatMsgs.map((m,i)=>(
            <div key={i} className={`vd-chat-msg ${m.role}`}>
              <div className="vd-chat-avatar">{m.role==="ai"?"🧑‍🏫":"👤"}</div>
              <div className="vd-chat-bubble" style={{whiteSpace:"pre-wrap"}}>{m.text}</div>
            </div>
          ))}
          {chatLoading&&(
            <div className="vd-chat-msg ai">
              <div className="vd-chat-avatar">🧑‍🏫</div>
              <div className="vd-chat-bubble">
                <div className="vd-chat-typing"><span/><span/><span/></div>
              </div>
            </div>
          )}
          <div ref={chatEndRef}/>
        </div>

        {/* Quick suggestions */}
        {chatMsgs.length<=2&&(
          <div className="vd-chat-suggestions">
            {SUGGESTIONS.map(s=>(
              <button key={s} className="vd-chat-suggest" onClick={()=>sendChat(s)}>{s}</button>
            ))}
          </div>
        )}

        <div className="vd-chat-input-row">
          <textarea
            ref={chatInputRef}
            className="vd-chat-input"
            value={chatInput}
            onChange={e=>setChatInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}}}
            placeholder="Ask anything about the exam results…"
            rows={1}
          />
          <button className="vd-chat-send" onClick={()=>sendChat()} disabled={!chatInput.trim()||chatLoading}>
            {Ico.send}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── Results view ──────────────────────────────────────────── */
  if (result&&derived) return (
    <div className="vd-app">
      <Sidebar/>
      <div className="vd-main">
        <Topbar/>
        <div className="vd-work">
          <QuestionPane
            questions={result.questions} matches={derived.matches} grades={derived.grades}
            blocks={derived.blocks} unmatched={derived.unmatched} summary={result.summary}
            activeQuestionId={activeQId} activeBlockId={activeBlkId}
            onSelectQuestion={selectQ} onSelectBlock={selectB}
          />
          <SheetPane
            pages={result.answerPages} blocks={result.blocks}
            activeBlockIds={activeBlockIds} activeLabel={activeLabel}
            onSelectBlock={selectB} onClear={()=>{setAQId(null);setABId(null);}}
          />
        </div>
      </div>
      {chatOpen&&<ChatModal/>}
    </div>
  );

  /* ── Upload / Progress view ────────────────────────────────── */
  return (
    <div className="vd-app">
      <Sidebar/>
      <div className="vd-main">
        <Topbar/>

        {/* PROGRESS */}
        {running&&progress ? (
          <div className="vd-progress-wrap">
            <div className="vd-spark-anim">
              <div className="vd-spark-ring"/>
              <svg viewBox="0 0 80 80" fill="none">
                <path d="M40 6 L47 33 L74 40 L47 47 L40 74 L33 47 L6 40 L33 33 Z" fill="#E8521A"/>
                <path d="M62 18 L65.5 29 L76 32.5 L65.5 36 L62 47 L58.5 36 L48 32.5 L58.5 29 Z" fill="rgba(232,82,26,0.55)"/>
                <circle cx="20" cy="20" r="4" fill="rgba(232,82,26,0.3)"/>
              </svg>
            </div>
            <div>
              <h2 className="vd-extracting-h">Extracting…</h2>
              <p className="vd-extracting-sub">{progress.label} — please wait</p>
            </div>
            <div className="vd-prog-card">
              {STAGES.map((s,i)=>{
                const done=i<curStageIdx, active=i===curStageIdx;
                return (
                  <div key={s} className={`vd-prog-step${done?" done":active?" active":""}`}>
                    <div className="vd-prog-icon">{done?"✓":active?"→":i+1}</div>
                    <span>{STAGE_LABELS[s]}</span>
                    {active&&progress.total>0&&<span style={{marginLeft:"auto",fontSize:11,color:"var(--ink-3)"}}>{progress.done}/{progress.total}</span>}
                  </div>
                );
              })}
              <div className="vd-prog-bar-track">
                <div className="vd-prog-bar-fill" style={{width:progress.total?`${Math.round(progress.done/progress.total*100)}%`:"6%"}}/>
              </div>
            </div>
          </div>
        ) : (
          /* UPLOAD */
          <div className="vd-landing">

            {/* Hero */}
            <div className="vd-hero">
              <div className="vd-hero-badge">🎓 AI-Powered Exam Marking</div>
              <h1 className="vd-hero-title">
                Upload your <span className="chalk-word">Question Paper</span><br/>
                &amp; <span className="chalk-word">Answer Sheet</span>
              </h1>
              <p className="vd-hero-sub">AI extracts every question, reads handwritten answers, maps them together, highlights the exact region — and gives per-question feedback.</p>
            </div>

            {/* Blackboard strip */}
            <div className="vd-classroom-strip">
              <div className="vd-board-text">∑ marks = ∫ effort · dt</div>
              <div className="vd-board-title">📋 Upload Files Below</div>
              <div className="vd-board-text">Q₁ + Q₂ + … = 🏆</div>
              <div className="vd-chalk-dust"/>
              <div className="vd-chalk-ledge"/>
            </div>

            {/* Desk with chalk items */}
            <div className="vd-desk">
              <div className="vd-chalk-item" style={{background:"#F0EDE4"}}/>
              <div className="vd-chalk-item" style={{background:"#FFD700"}}/>
              <div className="vd-chalk-item" style={{background:"#FF6B6B"}}/>
              <div className="vd-duster"/>
              <div className="vd-upload-wrapper">
                <span className="vd-upload-label">📂 Drop your files here or click to browse</span>
              </div>
            </div>

            {/* Upload zones */}
            <div className="vd-upload-grid">
              <label className={`vd-drop${qFiles.length?" is-set":""}${qOver?" is-over":""}`}
                onDragOver={e=>{e.preventDefault();setQO(true);}} onDragLeave={()=>setQO(false)}
                onDrop={e=>{setQO(false);dropFiles(setQF)(e);}}>
                <input type="file" accept=".pdf,image/*" multiple hidden onChange={e=>{const f=Array.from(e.target.files??[]);if(f.length)setQF(f);}}/>
                {qFiles.length ? (
                  <>
                    {qFiles.map((f,i)=>(
                      <div className="vd-file-card" key={i}>
                        <div className="vd-file-card-icon">PDF</div>
                        <div className="vd-file-card-info">
                          <div className="vd-file-card-name">{f.name}</div>
                          <div className="vd-file-card-meta">{fmtSize(f.size)}</div>
                        </div>
                        <div className="vd-file-card-remove" onClick={e=>{e.preventDefault();setQF([]); }}>×</div>
                      </div>
                    ))}
                    <span style={{fontSize:11,color:"var(--ink-4)"}}>Click to replace</span>
                  </>
                ) : (
                  <>
                    <div className="vd-drop-icon">{Ico.upload}</div>
                    <div className="vd-drop-label">Upload <span>Question Paper</span></div>
                    <div className="vd-drop-hint">PDF or images · Max 10 MB</div>
                  </>
                )}
              </label>

              <label className={`vd-drop${aFiles.length?" is-set":""}${aOver?" is-over":""}`}
                onDragOver={e=>{e.preventDefault();setAO(true);}} onDragLeave={()=>setAO(false)}
                onDrop={e=>{setAO(false);dropFiles(setAF)(e);}}>
                <input type="file" accept=".pdf,image/*" multiple hidden onChange={e=>{const f=Array.from(e.target.files??[]);if(f.length)setAF(f);}}/>
                {aFiles.length ? (
                  <>
                    {aFiles.map((f,i)=>(
                      <div className="vd-file-card" key={i}>
                        <div className="vd-file-card-icon">PDF</div>
                        <div className="vd-file-card-info">
                          <div className="vd-file-card-name">{f.name}</div>
                          <div className="vd-file-card-meta">{fmtSize(f.size)}</div>
                        </div>
                        <div className="vd-file-card-remove" onClick={e=>{e.preventDefault();setAF([]);}}>×</div>
                      </div>
                    ))}
                    <span style={{fontSize:11,color:"var(--ink-4)"}}>Click to replace</span>
                  </>
                ) : (
                  <>
                    <div className="vd-drop-icon">{Ico.upload}</div>
                    <div className="vd-drop-label">Upload <span>Answer Sheet</span></div>
                    <div className="vd-drop-hint">PDF or images · Max 10 MB</div>
                  </>
                )}
              </label>
            </div>

            {/* Options */}
            <div className="vd-options-card">
              <label className="vd-check">
                <input type="checkbox" checked={withGrading} onChange={e=>setGrade(e.target.checked)}/>
                <span><strong>AI Grading</strong> — mark every question, write feedback, generate improvement summary</span>
              </label>
              {needsKey&&(
                <div>
                  <label className="vd-key-label">Gemini API Key <span style={{color:"var(--ink-4)"}}>— stays in your browser, never sent to our servers</span></label>
                  <input className="vd-key-input" type="password" value={apiKey} onChange={e=>setKey(e.target.value)} placeholder="AQ.Ab8RN… (get free key at aistudio.google.com)"/>
                </div>
              )}
            </div>

            {error&&<div className="vd-error"><span>⚠</span><div><strong>Error:</strong> {error}</div></div>}

            <div className="vd-cta-row">
              <button className="vd-go" disabled={!canStart} onClick={start}>
                {Ico.star} {canStart?"Start Marking":"Upload both files to begin"}
              </button>
            </div>

            {/* How it works */}
            <div className="vd-how">
              {[
                {icon:"📄",title:"Upload",desc:"Question paper + answer booklet (PDF or images)"},
                {icon:"🔍",title:"Extract",desc:"AI reads every question and handwritten answer"},
                {icon:"🔗",title:"Map",desc:"Answers matched to questions, even out-of-order"},
                {icon:"✅",title:"Grade",desc:"Marks, per-question feedback & improvement tips"},
              ].map(s=>(
                <div className="vd-how-card" key={s.title}>
                  <div className="vd-how-icon">{s.icon}</div>
                  <div className="vd-how-title">{s.title}</div>
                  <div className="vd-how-desc">{s.desc}</div>
                </div>
              ))}
            </div>

            {/* History */}
            <div className="vd-history">
              <div className="vd-history-title">📊 Previous Sessions {history.length>0&&<span style={{fontSize:12,color:"var(--ink-4)",fontWeight:400}}>({history.length} saved)</span>}</div>
              {history.length===0 ? (
                <div className="vd-history-empty">No sessions yet. Run your first marking to see results here.</div>
              ) : (
                <div className="vd-history-grid">
                  {history.map(h=>{
                    const pct = h.max ? Math.round((h.awarded??0)/h.max*100) : null;
                    return (
                      <div className="vd-history-card" key={h.id}>
                        <div>
                          <div className="vd-history-score">
                            {h.awarded!==null&&h.max!==null?`${h.awarded}/${h.max}`:`${h.answered}/${h.total}`}
                          </div>
                          {pct!==null&&<div style={{fontSize:11,color:"var(--ink-4)"}}>{pct}%</div>}
                        </div>
                        <div className="vd-history-info">
                          <div className="vd-history-paper">{h.paper}</div>
                          <div className="vd-history-meta">{h.date} · {h.answered}/{h.total} answered</div>
                          {pct!==null&&<div className="vd-history-bar"><div className="vd-history-bar-fill" style={{width:`${pct}%`}}/></div>}
                          {h.overall&&<div style={{fontSize:11,color:"var(--ink-3)",marginTop:4,fontStyle:"italic"}}>"{h.overall.slice(0,80)}{h.overall.length>80?"…":""}"</div>}
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
                          {h.strengths.slice(0,2).map((s,i)=>(
                            <span key={i} style={{fontSize:10,background:"var(--green-bg)",color:"var(--green)",borderRadius:20,padding:"2px 7px",fontWeight:600,whiteSpace:"nowrap"}}>✓ {s}</span>
                          ))}
                          {h.focus.slice(0,1).map((s,i)=>(
                            <span key={i} style={{fontSize:10,background:"var(--amber-bg)",color:"var(--amber-text)",borderRadius:20,padding:"2px 7px",fontWeight:600,whiteSpace:"nowrap"}}>↑ {s}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
      {chatOpen&&<ChatModal/>}
    </div>
  );
}
