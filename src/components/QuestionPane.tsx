"use client";
import type { AnswerBlock, Grade, Match, Question, Summary } from "@/lib/types";

export default function QuestionPane(props: {
  questions: Question[];
  matches: Map<string, Match>;
  grades: Map<string, Grade>;
  blocks: Map<string, AnswerBlock>;
  unmatched: AnswerBlock[];
  summary: Summary;
  activeQuestionId: string | null;
  activeBlockId: string | null;
  onSelectQuestion: (id: string) => void;
  onSelectBlock: (id: string) => void;
}) {
  const { questions, matches, grades, summary, activeQuestionId, unmatched } = props;

  const getScore = (qId: string) => {
    const g = grades.get(qId);
    const q = questions.find(x => x.id === qId);
    const max = q?.marks ?? g?.max ?? null;
    const awarded = g?.awarded ?? null;
    if (awarded === null && max === null) return null;
    return { awarded, max, verdict: g?.verdict ?? (matches.has(qId) ? "partial" : "unanswered") };
  };

  const scoreCls = (v: string) =>
    v === "correct" ? "ok" : v === "unanswered" ? "warn" : v === "incorrect" ? "bad" : "ok";

  const answered = questions.filter(q => matches.has(q.id)).length;
  const totalMax = summary.max ?? 0;
  const totalAwarded = summary.awarded ?? 0;

  return (
    <div className="vd-qpane">
      <div className="vd-qpane-head">
        <div className="vd-qpane-title">
          📋 Extracted Questions
          <span style={{fontSize:11,color:"var(--ink-4)",fontWeight:400}}>from question paper</span>
        </div>
        <p className="vd-qpane-meta">
          {questions.length} questions · {answered} answered · {questions.length - answered} unanswered
        </p>
      </div>

      {/* Stats */}
      <div className="vd-stats">
        <div className="vd-stat">
          <div className="vd-stat-num orange">
            {totalMax ? `${totalAwarded}/${totalMax}` : answered}
          </div>
          <div className="vd-stat-label">{totalMax ? "Score" : "Answered"}</div>
        </div>
        <div className="vd-stat">
          <div className="vd-stat-num green">{answered}</div>
          <div className="vd-stat-label">Answered</div>
        </div>
        <div className="vd-stat">
          <div className="vd-stat-num warn">{questions.length - answered}</div>
          <div className="vd-stat-label">Missed</div>
        </div>
        {unmatched.length > 0 && (
          <div className="vd-stat">
            <div className="vd-stat-num" style={{color:"var(--ink-3)"}}>{unmatched.length}</div>
            <div className="vd-stat-label">Unplaced</div>
          </div>
        )}
      </div>

      {/* Overall */}
      {summary.overall && (
        <div className="vd-overall-strip">💬 {summary.overall}</div>
      )}

      {/* Improvement suggestions */}
      {(summary.strengths.length > 0 || summary.focus.length > 0) && (
        <div style={{padding:"10px 16px",background:"var(--paper-2)",borderBottom:"1px solid var(--rule)",display:"flex",gap:12,flexWrap:"wrap"}}>
          {summary.strengths.slice(0,2).map((s,i)=>(
            <span key={i} style={{fontSize:11,background:"var(--green-bg)",color:"var(--green)",borderRadius:20,padding:"3px 9px",fontWeight:600}}>✓ {s}</span>
          ))}
          {summary.focus.slice(0,2).map((s,i)=>(
            <span key={i} style={{fontSize:11,background:"var(--amber-bg)",color:"var(--amber-text)",borderRadius:20,padding:"3px 9px",fontWeight:600}}>↑ {s}</span>
          ))}
        </div>
      )}

      {/* Questions */}
      <div className="vd-qscroll">
        <ul className="vd-qlist">
          {questions.map((q, idx) => {
            const isActive = q.id === activeQuestionId;
            const isAnswered = matches.has(q.id);
            const g = grades.get(q.id);
            const s = getScore(q.id);

            return (
              <li key={q.id}>
                <button
                  className={`vd-q${isActive ? " is-active" : ""}`}
                  onClick={() => props.onSelectQuestion(q.id)}
                >
                  <div className="vd-q-badge">{idx + 1}</div>
                  <div className="vd-q-body">
                    <div className="vd-q-top">
                      <span className="vd-q-num">Q{q.number}{q.section ? ` · ${q.section}` : ""}</span>
                      {s ? (
                        <span className={`vd-q-score ${scoreCls(s.verdict)}`}>
                          {s.awarded !== null && s.max !== null
                            ? `${s.awarded} / ${s.max}`
                            : s.max !== null ? `— / ${s.max}` : isAnswered ? "✓" : "—"}
                        </span>
                      ) : q.marks ? (
                        <span className="vd-q-score none">— / {q.marks}</span>
                      ) : null}
                    </div>
                    <p className="vd-q-text">{q.text}</p>
                    <div className="vd-q-footer">
                      <span className={`vd-q-pill ${isAnswered ? "answered" : "unanswered"}`}>
                        {isAnswered ? "✓ Answered" : "✗ Unanswered"}
                      </span>
                      {q.marks && <span className="vd-q-pill marks">{q.marks} marks</span>}
                    </div>
                    {isActive && g?.feedback && (
                      <div className="vd-feedback">
                        <div className="vd-feedback-ttl">✦ AI Feedback</div>
                        <p className="vd-feedback-body">{g.feedback}</p>
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}

          {unmatched.length > 0 && (
            <>
              <li><p className="vd-section-label">⚠ Unplaced Answers ({unmatched.length})</p></li>
              {unmatched.map(b => (
                <li key={b.id}>
                  <button className="vd-unmatched-row" onClick={() => props.onSelectBlock(b.id)}>
                    <div className="vd-unmatched-badge">?</div>
                    <div className="vd-unmatched-text">
                      {b.label ? <><strong>Label: {b.label}</strong> — </> : <><em>No label</em> — </>}
                      {b.text.slice(0, 110)}{b.text.length > 110 ? "…" : ""}
                    </div>
                  </button>
                </li>
              ))}
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
