"use client";

import { useEffect, useMemo, useState } from "react";
import QuestionPane from "@/components/QuestionPane";
import SheetPane from "@/components/SheetPane";
import { runPipeline, type Result } from "@/lib/pipeline";
import type { Progress } from "@/lib/types";

/* ── SVG Icons ─────────────────────────────────────────────────────── */
const I = {
  home: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  exam: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  upload: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
  spark: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>,
  check: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>,
  warn: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  new: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  dl: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
};

const STAGES = ["reading","questions","answers","mapping","grading"] as const;
const STAGE_LABELS: Record<string,string> = {
  reading:"Reading files", questions:"Extracting questions",
  answers:"Reading answers", mapping:"Mapping answers", grading:"Grading",
};

export default function Page() {
  const [questionFiles, setQF] = useState<File[]>([]);
  const [answerFiles,   setAF] = useState<File[]>([]);
  const [apiKey,   setKey]   = useState("");
  const [needsKey, setNeedsKey] = useState(false);
  const [withGrading, setGrade] = useState(true);
  const [running,  setRunning]  = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [result,   setResult]   = useState<Result | null>(null);
  const [activeQId, setActiveQId]   = useState<string | null>(null);
  const [activeBlkId, setActiveBlkId] = useState<string | null>(null);
  const [qOver, setQOver] = useState(false);
  const [aOver, setAOver] = useState(false);

  useEffect(() => {
    fetch("/api/status").then(r=>r.json()).then(s=>setNeedsKey(!s.hasServerKey)).catch(()=>setNeedsKey(true));
  }, []);

  const canStart = questionFiles.length > 0 && answerFiles.length > 0 && (!needsKey || apiKey.trim().length > 3);

  const start = async () => {
    setRunning(true); setError(null); setResult(null); setActiveQId(null);
    try {
      const res = await runPipeline({ questionFiles, answerFiles, apiKey, withGrading, onProgress: setProgress });
      setResult(res);
      setActiveQId(res.matches[0]?.questionId ?? null);
    } catch(err) {
      setError(err instanceof Error ? err.message : "Unknown error. Check your API key and try again.");
    } finally { setRunning(false); }
  };

  const reset = () => { setResult(null); setProgress(null); setError(null); setActiveQId(null); setActiveBlkId(null); setQF([]); setAF([]); };

  const derived = useMemo(() => {
    if (!result) return null;
    const matches = new Map(result.matches.map(m=>[m.questionId,m]));
    const grades  = new Map(result.grades.map(g=>[g.questionId,g]));
    const blocks  = new Map(result.blocks.map(b=>[b.id,b]));
    const unmatchedIds = new Set(result.unmatchedBlockIds);
    const unmatched = result.blocks.filter(b=>unmatchedIds.has(b.id)&&b.text.replace(/\u200b/g,"").trim());
    return { matches, grades, blocks, unmatched };
  }, [result]);

  const activeBlockIds = useMemo(()=>{
    if (!result||!derived) return [];
    if (activeQId) {
      const m = derived.matches.get(activeQId);
      if (!m) return [];
      const base = new Set(m.blockIds);
      return result.blocks.filter(b=>base.has(b.id)||[...base].some(id=>b.id.startsWith(`${id}-x`))).map(b=>b.id);
    }
    if (activeBlkId) return [activeBlkId];
    return [];
  }, [result, derived, activeQId, activeBlkId]);

  const activeLabel = useMemo(()=>{
    if (!result) return null;
    if (activeQId) return result.questions.find(q=>q.id===activeQId)?.number??null;
    if (activeBlkId) return result.blocks.find(b=>b.id===activeBlkId)?.label??"?";
    return null;
  }, [result, activeQId, activeBlkId]);

  const selectQ = (id:string) => { setActiveBlkId(null); setActiveQId(c=>c===id?null:id); };
  const selectB = (id:string) => {
    if (!result) return;
    const owner = result.matches.find(m=>m.blockIds.includes(id));
    if (owner) { setActiveBlkId(null); setActiveQId(owner.questionId); return; }
    setActiveQId(null); setActiveBlkId(c=>c===id?null:id);
  };

  const dropFiles = (setter:(f:File[])=>void) => (e:React.DragEvent) => {
    e.preventDefault();
    const fs = Array.from(e.dataTransfer.files).filter(f=>f.type==="application/pdf"||f.type.startsWith("image/"));
    if (fs.length) setter(fs);
  };

  const fmtSize = (n:number) => n>1e6?`${(n/1e6).toFixed(1)} MB`:`${Math.round(n/1000)} KB`;

  const curStageIdx = progress ? STAGES.indexOf(progress.stage as typeof STAGES[number]) : -1;

  const exportCSV = () => {
    if (!result||!derived) return;
    const rows = [["Question","Number","Status","Awarded","Max","Verdict","Feedback"]];
    for (const q of result.questions) {
      const m = derived.matches.get(q.id);
      const g = derived.grades.get(q.id);
      rows.push([q.text.slice(0,80), q.number, m?"Answered":"Unanswered", String(g?.awarded??""), String(q.marks??""), g?.verdict??"", g?.feedback??""]);
    }
    const csv = rows.map(r=>r.map(c=>`"${c.replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="veda-marks.csv"; a.click();
  };

  /* ── Sidebar ─────────────────────────────────────────────────────── */
  const Sidebar = () => (
    <aside className="vd-sidebar">
      <div className="vd-sidebar-logo">
        <div className="vd-logo-mark">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <span className="vd-logo-text">VedaAI</span>
      </div>

      <button className="vd-sidebar-ai">
        {I.spark} AI Teacher&apos;s Toolkit
      </button>

      <p className="vd-sidebar-section">Workspace</p>

      <ul className="vd-nav">
        <li className="vd-nav-item" onClick={result?reset:undefined} style={{cursor:result?"pointer":"default"}}>
          {I.home} Home {result && <span style={{marginLeft:"auto",fontSize:10,color:"rgba(255,255,255,0.35)"}}>← back</span>}
        </li>
        <li className="vd-nav-item active">
          {I.exam} Marking Desk <span className="vd-nav-badge">Live</span>
        </li>
      </ul>

      <div style={{flex:1}}/>
      <div className="vd-sidebar-footer">
        <div className="vd-user-avatar">S</div>
        <div className="vd-user-info">
          <div className="vd-user-name">Sanjay P.</div>
          <div className="vd-user-role">Teacher</div>
        </div>
      </div>
    </aside>
  );

  /* ── Topbar ──────────────────────────────────────────────────────── */
  const Topbar = () => (
    <div className="vd-topbar">
      <span className="vd-topbar-title">
        Marking Desk
        {result && <span className="vd-topbar-subtitle">· {result.questions.length} questions · {result.matches.length} answered</span>}
      </span>
      {result && (
        <>
          <button className="vd-topbar-btn ghost" onClick={exportCSV}>{I.dl} Export CSV</button>
          <button className="vd-topbar-btn primary" onClick={reset}>{I.new} New Session</button>
        </>
      )}
    </div>
  );

  /* ── Results view ────────────────────────────────────────────────── */
  if (result && derived) {
    return (
      <div className="vd-app">
        <Sidebar/>
        <div className="vd-main">
          <Topbar/>
          <div className="vd-work">
            <QuestionPane
              questions={result.questions}
              matches={derived.matches}
              grades={derived.grades}
              blocks={derived.blocks}
              unmatched={derived.unmatched}
              summary={result.summary}
              activeQuestionId={activeQId}
              activeBlockId={activeBlkId}
              onSelectQuestion={selectQ}
              onSelectBlock={selectB}
            />
            <SheetPane
              pages={result.answerPages}
              blocks={result.blocks}
              activeBlockIds={activeBlockIds}
              activeLabel={activeLabel}
              onSelectBlock={selectB}
              onClear={()=>{setActiveQId(null);setActiveBlkId(null);}}
            />
          </div>
        </div>
      </div>
    );
  }

  /* ── Upload / Progress view ──────────────────────────────────────── */
  return (
    <div className="vd-app">
      <Sidebar/>
      <div className="vd-main">
        <Topbar/>

        {/* PROGRESS SCREEN */}
        {running && progress ? (
          <div className="vd-progress-wrap">
            <div className="vd-spark-anim">
              <div className="vd-spark-ring"/>
              <svg viewBox="0 0 80 80" fill="none">
                <path d="M40 6 L47 33 L74 40 L47 47 L40 74 L33 47 L6 40 L33 33 Z" fill="#E8521A"/>
                <path d="M62 18 L65.5 29 L76 32.5 L65.5 36 L62 47 L58.5 36 L48 32.5 L58.5 29 Z" fill="rgba(232,82,26,0.55)"/>
                <circle cx="20" cy="20" r="4" fill="rgba(232,82,26,0.3)"/>
              </svg>
            </div>
            <div className="vd-extracting-text">
              <h2 className="vd-extracting-h">Extracting…</h2>
              <p className="vd-extracting-sub">{progress.label} — this may take a while</p>
            </div>
            <div className="vd-prog-card">
              {STAGES.map((s,i)=>{
                const done = i < curStageIdx;
                const active = i === curStageIdx;
                return (
                  <div key={s} className={`vd-prog-step${done?" done":active?" active":""}`}>
                    <div className="vd-prog-icon">{done?"✓":active?"→":i+1}</div>
                    <span>{STAGE_LABELS[s]}</span>
                    {active && progress.total > 0 && (
                      <span style={{marginLeft:"auto",fontSize:11,color:"var(--ink-3)"}}>
                        {progress.done}/{progress.total}
                      </span>
                    )}
                  </div>
                );
              })}
              <div className="vd-prog-bar-track">
                <div className="vd-prog-bar-fill" style={{width: progress.total?`${Math.round((progress.done/progress.total)*100)}%`:"8%"}}/>
              </div>
            </div>
          </div>
        ) : (
          /* UPLOAD SCREEN */
          <div className="vd-landing">

            {/* Hero */}
            <div className="vd-hero">
              <div className="vd-hero-eyebrow">{I.spark} AI-Powered Answer Mapping</div>
              <h1 className="vd-hero-title">
                Upload <span className="accent">Question Paper<br/>&amp; Answer Sheets</span>
              </h1>
              <p className="vd-hero-sub">
                AI extracts every question, reads handwritten answers, maps them together,
                and highlights the exact region on the sheet.
              </p>
            </div>

            {/* Teacher illustration */}
            <div className="vd-teacher-wrap">
              <div className="vd-teacher-ring"/>
              <div className="vd-teacher-ring2"/>
              <div className="vd-teacher-circle">👩‍🏫</div>
              <span className="vd-teacher-dot" style={{top:4,right:8}}/>
              <span className="vd-teacher-dot" style={{bottom:8,left:10,width:8,height:8,background:"rgba(232,82,26,0.45)"}}/>
              <span className="vd-teacher-dot" style={{top:"50%",left:-4,width:7,height:7,background:"rgba(232,82,26,0.3)",transform:"translateY(-50%)"}}/>
            </div>

            {/* Upload zones */}
            <div className="vd-upload-grid">

              {/* Question paper */}
              <label
                className={`vd-drop${questionFiles.length?" is-set":""}${qOver?" is-over":""}`}
                onDragOver={e=>{e.preventDefault();setQOver(true);}}
                onDragLeave={()=>setQOver(false)}
                onDrop={e=>{setQOver(false);dropFiles(setQF)(e);}}
              >
                <input type="file" accept=".pdf,image/*" multiple hidden onChange={e=>{const f=Array.from(e.target.files??[]);if(f.length)setQF(f);}}/>
                {questionFiles.length ? (
                  <>
                    {questionFiles.map((f,i)=>(
                      <div className="vd-file-card" key={i}>
                        <div className="vd-file-card-icon">PDF</div>
                        <div className="vd-file-card-info">
                          <div className="vd-file-card-name">{f.name}</div>
                          <div className="vd-file-card-meta">{fmtSize(f.size)}</div>
                        </div>
                        <div className="vd-file-card-remove" onClick={e=>{e.preventDefault();setQF([]);}}>×</div>
                      </div>
                    ))}
                    <span style={{fontSize:11,color:"var(--ink-4)"}}>Click to replace</span>
                  </>
                ) : (
                  <>
                    <div className="vd-drop-upload-icon">{I.upload}</div>
                    <div className="vd-drop-label">Upload <span>Question Paper</span></div>
                    <div className="vd-drop-hint">PDF or images · Max 10 MB</div>
                  </>
                )}
              </label>

              {/* Answer sheet */}
              <label
                className={`vd-drop${answerFiles.length?" is-set":""}${aOver?" is-over":""}`}
                onDragOver={e=>{e.preventDefault();setAOver(true);}}
                onDragLeave={()=>setAOver(false)}
                onDrop={e=>{setAOver(false);dropFiles(setAF)(e);}}
              >
                <input type="file" accept=".pdf,image/*" multiple hidden onChange={e=>{const f=Array.from(e.target.files??[]);if(f.length)setAF(f);}}/>
                {answerFiles.length ? (
                  <>
                    {answerFiles.map((f,i)=>(
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
                    <div className="vd-drop-upload-icon">{I.upload}</div>
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
                <span><strong>AI Grading</strong> — Mark the script and write per-question feedback (adds one extra pass)</span>
              </label>
              {needsKey && (
                <div className="vd-key-row">
                  <span className="vd-key-label">Gemini API Key <span style={{color:"var(--ink-4)"}}>— kept in your browser only, never sent to our servers</span></span>
                  <input className="vd-key-input" type="password" value={apiKey} onChange={e=>setKey(e.target.value)} placeholder="AQ.Ab8RN…  (get free key at aistudio.google.com)"/>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="vd-error">
                {I.warn}
                <div><strong>Error:</strong> {error}</div>
              </div>
            )}

            {/* CTA */}
            <div className="vd-cta-row">
              <button className="vd-go" disabled={!canStart} onClick={start}>
                {I.spark}
                {canStart ? "Start Marking" : "Upload both files to begin"}
              </button>
            </div>

            {/* How it works */}
            <div style={{width:"100%",maxWidth:720,marginTop:32,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
              {[
                {icon:"📄",title:"Upload",desc:"Question paper + answer booklet"},
                {icon:"🔍",title:"Extract",desc:"AI reads every question & answer"},
                {icon:"🔗",title:"Map",desc:"Answers matched to questions"},
                {icon:"✅",title:"Grade",desc:"Marks, feedback & summary"},
              ].map(s=>(
                <div key={s.title} style={{background:"var(--white)",border:"1px solid var(--rule)",borderRadius:"var(--r-md)",padding:"16px 14px",textAlign:"center"}}>
                  <div style={{fontSize:24,marginBottom:8}}>{s.icon}</div>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--ink)",marginBottom:4}}>{s.title}</div>
                  <div style={{fontSize:11,color:"var(--ink-4)",lineHeight:1.4}}>{s.desc}</div>
                </div>
              ))}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
