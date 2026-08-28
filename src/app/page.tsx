"use client";

import { useEffect, useMemo, useState } from "react";
import QuestionPane from "@/components/QuestionPane";
import SheetPane from "@/components/SheetPane";
import { runPipeline, type Result } from "@/lib/pipeline";
import type { Progress } from "@/lib/types";

/* ── tiny icon helpers ──────────────────────────────────────────────── */
const HomeIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const ClassIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
const AssignIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
const ExamIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>;
const LibIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
const StarIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>;
const UploadIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>;

export default function Page() {
  const [questionFiles, setQuestionFiles] = useState<File[]>([]);
  const [answerFiles, setAnswerFiles]     = useState<File[]>([]);
  const [apiKey, setApiKey]               = useState("");
  const [needsKey, setNeedsKey]           = useState(false);
  const [withGrading, setWithGrading]     = useState(true);
  const [running, setRunning]             = useState(false);
  const [progress, setProgress]           = useState<Progress | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [result, setResult]               = useState<Result | null>(null);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId]       = useState<string | null>(null);
  const [qDragOver, setQDragOver] = useState(false);
  const [aDragOver, setADragOver] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then(r => r.json())
      .then(s => setNeedsKey(!s.hasServerKey))
      .catch(() => setNeedsKey(true));
  }, []);

  const start = async () => {
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await runPipeline({ questionFiles, answerFiles, apiKey, withGrading, onProgress: setProgress });
      setResult(res);
      setActiveQuestionId(res.matches[0]?.questionId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setRunning(false); }
  };

  const reset = () => { setResult(null); setProgress(null); setError(null); setActiveQuestionId(null); setActiveBlockId(null); };

  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const t = e.target as HTMLElement|null;
      if (t && ["INPUT","TEXTAREA"].includes(t.tagName)) return;
      e.preventDefault();
      const ids = result.questions.map(q => q.id);
      const at = activeQuestionId ? ids.indexOf(activeQuestionId) : -1;
      const next = e.key === "ArrowDown" ? at+1 : at-1;
      if (next >= 0 && next < ids.length) { setActiveBlockId(null); setActiveQuestionId(ids[next]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, activeQuestionId]);

  const derived = useMemo(() => {
    if (!result) return null;
    const matches = new Map(result.matches.map(m => [m.questionId, m]));
    const grades  = new Map(result.grades.map(g  => [g.questionId, g]));
    const blocks  = new Map(result.blocks.map(b  => [b.id, b]));
    const unmatchedIds = new Set(result.unmatchedBlockIds);
    const unmatched = result.blocks.filter(b => unmatchedIds.has(b.id) && b.text.replace(/\u200b/g,"").trim());
    return { matches, grades, blocks, unmatched };
  }, [result]);

  const activeBlockIds = useMemo(() => {
    if (!result || !derived) return [];
    if (activeQuestionId) {
      const match = derived.matches.get(activeQuestionId);
      if (!match) return [];
      const base = new Set(match.blockIds);
      return result.blocks.filter(b => base.has(b.id) || [...base].some(id => b.id.startsWith(`${id}-x`))).map(b => b.id);
    }
    if (activeBlockId) return [activeBlockId];
    return [];
  }, [result, derived, activeQuestionId, activeBlockId]);

  const activeLabel = useMemo(() => {
    if (!result) return null;
    if (activeQuestionId) return result.questions.find(q => q.id === activeQuestionId)?.number ?? null;
    if (activeBlockId) { const b = result.blocks.find(x => x.id === activeBlockId); return b?.label ?? "?"; }
    return null;
  }, [result, activeQuestionId, activeBlockId]);

  const selectQuestion = (id: string) => { setActiveBlockId(null); setActiveQuestionId(c => c === id ? null : id); };
  const selectBlock = (id: string) => {
    if (!result) return;
    const owner = result.matches.find(m => m.blockIds.includes(id));
    if (owner) { setActiveBlockId(null); setActiveQuestionId(owner.questionId); return; }
    setActiveQuestionId(null); setActiveBlockId(c => c === id ? null : id);
  };

  const handleFileDrop = (setter: (f: File[]) => void) => (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf" || f.type.startsWith("image/"));
    if (files.length) setter(files);
  };

  const canStart = questionFiles.length > 0 && answerFiles.length > 0 && (!needsKey || apiKey.trim());

  /* progress stages */
  const stages = ["reading","questions","answers","mapping","grading","ready"] as const;
  const stageLabel: Record<string, string> = {
    reading:"Reading files", questions:"Extracting questions", answers:"Reading answers",
    mapping:"Mapping answers", grading:"Grading", ready:"Complete",
  };
  const currentStageIdx = progress ? stages.indexOf(progress.stage as typeof stages[number]) : -1;

  /* file size helper */
  const fmtSize = (bytes: number) => bytes > 1_000_000 ? `${(bytes/1_000_000).toFixed(1)}MB` : `${Math.round(bytes/1000)}KB`;

  const sidebar = (
    <aside className="vd-sidebar">
      <div className="vd-logo">
        <div className="vd-logo-icon">V</div>
        VedaAI
      </div>
      <button className="vd-ai-btn">
        <StarIcon /> AI Teacher&apos;s Toolkit
      </button>
      <ul className="vd-nav">
        <li><HomeIcon /> Home</li>
        <li><ClassIcon /> My Classroom</li>
        <li><AssignIcon /> Assignments</li>
        <li className="active"><ExamIcon /> Exams</li>
        <li><LibIcon /> My Library</li>
      </ul>
    </aside>
  );

  const topbar = (
    <div className="vd-topbar">
      {result && (
        <>
          <button className="vd-go" style={{width:"auto",padding:"8px 18px",fontSize:"13px",borderRadius:"8px",fontWeight:600}} onClick={() => { const blockById=new Map(result.blocks.map(b=>[b.id,b])); const rows=[["Q","Status","Marks","Max","Verdict","Feedback",...result.questions.map(q=>{const m=derived?.matches.get(q.id);const g=derived?.grades.get(q.id);return[q.number,m?"answered":"blank",g?.awarded??"",q.marks??"",g?.verdict??"",g?.feedback??""]})]];const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));const a=document.createElement("a");a.href=url;a.download="marks.csv";a.click(); }}>
            Export CSV
          </button>
          <button className="vd-go" style={{width:"auto",padding:"8px 18px",fontSize:"13px",borderRadius:"8px",fontWeight:600,background:"#3A3A3C"}} onClick={reset}>
            New Session
          </button>
        </>
      )}
      <div className="vd-topbar-btn" style={{position:"relative"}}>
        🔔 <span className="vd-notif-dot"/>
      </div>
      <div className="vd-avatar">K</div>
    </div>
  );

  if (result && derived) {
    return (
      <div className="vd-app">
        <div className="vd-shell">
          {sidebar}
          <div className="vd-main">
            {topbar}
            <main className="vd-work">
              <QuestionPane
                questions={result.questions}
                matches={derived.matches}
                grades={derived.grades}
                blocks={derived.blocks}
                unmatched={derived.unmatched}
                summary={result.summary}
                activeQuestionId={activeQuestionId}
                activeBlockId={activeBlockId}
                onSelectQuestion={selectQuestion}
                onSelectBlock={selectBlock}
              />
              <SheetPane
                pages={result.answerPages}
                blocks={result.blocks}
                activeBlockIds={activeBlockIds}
                activeLabel={activeLabel}
                onSelectBlock={selectBlock}
                onClear={() => { setActiveQuestionId(null); setActiveBlockId(null); }}
              />
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vd-app">
      <div className="vd-shell">
        {sidebar}
        <div className="vd-main">
          {topbar}
          <div className="vd-landing">
            <h1 className="vd-landing-title">
              Upload <span>Question Paper &amp; Answer Sheets</span>
            </h1>
            <p className="vd-landing-sub">Upload both files to get started</p>

            {/* teacher illustration */}
            <div className="vd-teacher">
              <div className="vd-teacher-inner">👩‍🏫</div>
              <span className="vd-teacher-dot" style={{top:6,right:6}}/>
              <span className="vd-teacher-dot" style={{bottom:6,left:14,width:8,height:8,background:"rgba(232,82,26,0.5)"}}/>
              <span className="vd-teacher-dot" style={{top:"50%",left:2,width:7,height:7,background:"rgba(232,82,26,0.35)",transform:"translateY(-50%)"}}/>
            </div>

            {/* drop zones */}
            <div className="vd-drops">
              {/* Question paper */}
              <label
                className={`vd-drop${questionFiles.length ? " is-set" : ""}${qDragOver ? " is-over" : ""}`}
                onDragOver={e=>{e.preventDefault();setQDragOver(true);}}
                onDragLeave={()=>setQDragOver(false)}
                onDrop={e=>{setQDragOver(false);handleFileDrop(setQuestionFiles)(e);}}
              >
                <input type="file" accept=".pdf,image/*" multiple style={{display:"none"}} onChange={e=>{const f=Array.from(e.target.files??[]);if(f.length)setQuestionFiles(f);}} />
                {questionFiles.length ? (
                  <>
                    {questionFiles.map((f,i) => (
                      <div className="vd-file-chip" key={i}>
                        <div className="vd-file-chip-icon">PDF</div>
                        <div className="vd-file-chip-info">
                          <div className="vd-file-chip-name">{f.name}</div>
                          <div className="vd-file-chip-meta">{fmtSize(f.size)}</div>
                        </div>
                      </div>
                    ))}
                    <span style={{fontSize:12,color:"var(--mid)"}}>Click to change</span>
                  </>
                ) : (
                  <>
                    <div className="vd-drop-icon"><UploadIcon /></div>
                    <div className="vd-drop-title">Upload <span>Question Paper</span></div>
                    <div className="vd-drop-hint">Max 10MB</div>
                  </>
                )}
              </label>

              {/* Answer sheet */}
              <label
                className={`vd-drop${answerFiles.length ? " is-set" : ""}${aDragOver ? " is-over" : ""}`}
                onDragOver={e=>{e.preventDefault();setADragOver(true);}}
                onDragLeave={()=>setADragOver(false)}
                onDrop={e=>{setADragOver(false);handleFileDrop(setAnswerFiles)(e);}}
              >
                <input type="file" accept=".pdf,image/*" multiple style={{display:"none"}} onChange={e=>{const f=Array.from(e.target.files??[]);if(f.length)setAnswerFiles(f);}} />
                {answerFiles.length ? (
                  <>
                    {answerFiles.map((f,i) => (
                      <div className="vd-file-chip" key={i}>
                        <div className="vd-file-chip-icon">PDF</div>
                        <div className="vd-file-chip-info">
                          <div className="vd-file-chip-name">{f.name}</div>
                          <div className="vd-file-chip-meta">{fmtSize(f.size)}</div>
                        </div>
                      </div>
                    ))}
                    <span style={{fontSize:12,color:"var(--mid)"}}>Click to change</span>
                  </>
                ) : (
                  <>
                    <div className="vd-drop-icon"><UploadIcon /></div>
                    <div className="vd-drop-title">Upload <span>Answer Sheet</span></div>
                    <div className="vd-drop-hint">Max 10MB</div>
                  </>
                )}
              </label>
            </div>

            {/* options */}
            <div className="vd-options">
              <label className="vd-check">
                <input type="checkbox" checked={withGrading} onChange={e=>setWithGrading(e.target.checked)} />
                Mark the script and write per-question feedback. Adds one pass.
              </label>
              {needsKey && (
                <div>
                  <span className="vd-key-label">Gemini API key (kept in browser only)</span>
                  <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="AQ.Ab8RN…" className="vd-key" />
                </div>
              )}
            </div>

            {/* error */}
            {error && <div className="vd-error">{error}</div>}

            {/* progress */}
            {running && progress && (
              <div className="vd-progress" style={{width:"100%",maxWidth:680}}>
                <div className="vd-extracting">
                  <div className="vd-spark">
                    <svg viewBox="0 0 80 80" fill="none">
                      <path d="M40 8 L46 36 L72 40 L46 44 L40 72 L34 44 L8 40 L34 36 Z" fill="#E8521A"/>
                      <path d="M60 20 L63 30 L72 33 L63 36 L60 46 L57 36 L48 33 L57 30 Z" fill="rgba(232,82,26,0.5)"/>
                      <circle cx="22" cy="22" r="3" fill="rgba(232,82,26,0.35)"/>
                    </svg>
                  </div>
                  <div className="vd-extracting-label">Extracting…</div>
                  <div className="vd-extracting-sub">{progress.label} — this may take a while</div>
                </div>
                <div className="vd-prog-steps">
                  {stages.slice(0,-1).map((s,i) => {
                    const done = i < currentStageIdx;
                    const active = i === currentStageIdx;
                    return (
                      <div key={s} className={`vd-prog-step${done?" is-done":active?" is-active":""}`}>
                        <div className="vd-prog-dot">{done?"✓":i+1}</div>
                        <span>{stageLabel[s]}</span>
                      </div>
                    );
                  })}
                  <div className="vd-prog-bar-wrap">
                    <div className="vd-prog-bar" style={{width: progress.total ? `${Math.round((progress.done/progress.total)*100)}%` : "5%"}} />
                  </div>
                </div>
              </div>
            )}

            {/* go */}
            {!running && (
              <div className="vd-go-wrap">
                <button className="vd-go" disabled={!canStart} onClick={start}>
                  Start marking
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
