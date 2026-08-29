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

  const score = (qId: string) => {
    const g = grades.get(qId);
    const q = questions.find(x => x.id === qId);
    const max = q?.marks ?? g?.max ?? null;
    const awarded = g?.awarded ?? null;
    if (awarded === null && max === null) return null;
    return { awarded, max, verdict: g?.verdict ?? (matches.has(qId) ? "partial" : "unanswered") };
  };

  const scoreCls = (verdict: string) => {
    if (verdict === "correct") return "ok";
    if (verdict === "unanswered") return "warn";
    if (verdict === "incorrect") return "bad";
    return "ok";
  };

  const answered = questions.filter(q => matches.has(q.id)).length;
  const total = summary.max ?? 0;
  const awarded = summary.awarded ?? 0;

  return (
    <div className="vd-qpane">
      {/* Header */}
      <div className="vd-qpane-head">
        <div className="vd-qpane-title-row">
          <span className="vd-qpane-title">
            📋 Extracted Questions
          </span>
          <span style={{fontSize:11,color:"var(--ink-4)"}}>from question paper</span>
        </div>
        <p className="vd-qpane-meta">
          {questions.length} questions · {answered} answered · {questions.length - answered} unanswered
        </p>
      </div>

      {/* Stats bar */}
      <div className="vd-stats">
        <div className="vd-stat">
          <div className="vd-stat-num orange">{total ? `${awarded}/${total}` : answered}</div>
          <div className="vd-stat-label">{total ? "Score" : "Answered"}</div>
        </div>
        <div className="vd-stat">
          <div className="vd-stat-num green">{answered}</div>
          <div className="vd-stat-label">Answered</div>
        </div>
        <div className="vd-stat">
          <div className="vd-stat-num amber">{questions.length - answered}</div>
          <div className="vd-stat-label">Missing</div>
        </div>
        {unmatched.length > 0 && (
          <div className="vd-stat">
            <div className="vd-stat-num" style={{color:"var(--ink-3)"}}>{unmatched.length}</div>
            <div className="vd-stat-label">Unplaced</div>
          </div>
        )}
      </div>

      {/* Overall feedback */}
      {summary.overall && (
        <div className="vd-overall-strip">
          💬 {summary.overall}
        </div>
      )}

      {/* Questions list */}
      <div className="vd-qscroll">
        <ul className="vd-qlist">
          {questions.map((q, idx) => {
            const isActive = q.id === activeQuestionId;
            const isAnswered = matches.has(q.id);
            const g = grades.get(q.id);
            const s = score(q.id);

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
                      {s && (
                        <span className={`vd-q-score ${scoreCls(s.verdict)}`}>
                          {s.awarded !== null && s.max !== null
                            ? `${s.awarded} / ${s.max}`
                            : s.max !== null
                            ? `— / ${s.max}`
                            : isAnswered ? "✓" : "—"
                          }
                        </span>
                      )}
                      {!s && q.marks && (
                        <span className="vd-q-score none">— / {q.marks}</span>
                      )}
                    </div>

                    <p className="vd-q-text">{q.text}</p>

                    <div className="vd-q-footer">
                      <span className={`vd-q-pill ${isAnswered ? "answered" : "unanswered"}`}>
                        {isAnswered ? "✓ Answered" : "✗ Unanswered"}
                      </span>
                      {q.marks && <span className="vd-q-pill marks">{q.marks} marks</span>}
                    </div>

                    {/* AI Feedback shown when active */}
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

          {/* Unplaced answers */}
          {unmatched.length > 0 && (
            <>
              <li><p className="vd-section-label">⚠ Unplaced Answers ({unmatched.length})</p></li>
              {unmatched.map(b => (
                <li key={b.id}>
                  <button className="vd-unmatched-row" onClick={() => props.onSelectBlock(b.id)}>
                    <div className="vd-unmatched-badge">?</div>
                    <div className="vd-unmatched-text">
                      {b.label ? <strong>Label: {b.label}</strong> : <em>No label</em>}
                      {" — "}{b.text.slice(0, 120)}{b.text.length > 120 ? "…" : ""}
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
