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
  const answered = questions.filter(q => matches.has(q.id));
  const unanswered = questions.filter(q => !matches.has(q.id));

  const ScoreBadge = ({ qId }: { qId: string }) => {
    const g = grades.get(qId);
    const q = questions.find(x => x.id === qId);
    if (!g && !q?.marks) return null;
    const awarded = g?.awarded ?? null;
    const max = q?.marks ?? g?.max ?? null;
    const cls = !matches.has(qId) ? "unanswered" : g?.verdict === "incorrect" ? "incorrect" : "";
    return (
      <span className={`vd-score-badge ${cls}`}>
        {awarded !== null && max !== null ? `${awarded}/${max}` : awarded !== null ? String(awarded) : max !== null ? `—/${max}` : ""}
      </span>
    );
  };

  return (
    <div className="vd-pane">
      {/* header */}
      <div className="vd-pane-head">
        <div className="vd-pane-title">
          Extracted Questions <span style={{fontSize:12,color:"var(--mid)",fontWeight:400}}>(from question paper)</span>
          <button className="vd-expand-btn">Expand All</button>
        </div>
        <div className="vd-pane-meta">{questions.length} questions · {answered.length} answered · {unanswered.length} unanswered</div>
      </div>

      {/* summary */}
      {(summary.awarded !== null || summary.answered > 0) && (
        <div className="vd-summary">
          {summary.awarded !== null && summary.max !== null && (
            <div className="vd-score">
              <span className="vd-score-value">{summary.awarded}</span>
              <span className="vd-score-max">/ {summary.max}</span>
            </div>
          )}
          <div className="vd-tally">
            <span>✅ {summary.answered} answered</span>
            {summary.unanswered > 0 && <span>⚠️ {summary.unanswered} unanswered</span>}
            {summary.unmatched > 0 && <span>❓ {summary.unmatched} unplaced</span>}
          </div>
          {summary.overall && <p className="vd-overall">{summary.overall}</p>}
        </div>
      )}

      {/* question list */}
      <div className="vd-qscroll">
        <ul className="vd-qlist">
          {questions.map((q, idx) => {
            const isActive = q.id === activeQuestionId;
            const isAnswered = matches.has(q.id);
            const g = grades.get(q.id);

            return (
              <li key={q.id}>
                <button className={`vd-q${isActive ? " is-active" : ""}`} onClick={() => props.onSelectQuestion(q.id)}>
                  <div className="vd-q-num">{idx + 1}</div>
                  <div className="vd-q-body">
                    <div className="vd-q-row">
                      <span style={{fontSize:11,fontWeight:600,color:"var(--mid)",marginBottom:2,display:"block"}}>
                        {q.number}{q.section ? ` · ${q.section}` : ""}
                      </span>
                      <ScoreBadge qId={q.id} />
                    </div>
                    <p className="vd-q-text">{q.text}</p>
                    <div className="vd-q-row" style={{marginTop:4}}>
                      <span className={`vd-q-status ${isAnswered ? "answered" : "unanswered"}`}>
                        {isAnswered ? "✓ Answered" : "✗ Unanswered"}
                      </span>
                      {q.marks && <span style={{fontSize:11,color:"var(--mid)"}}>{q.marks} marks</span>}
                    </div>
                    {isActive && g?.feedback && (
                      <div className="vd-q-feedback">
                        <div className="vd-q-feedback-label">AI Feedback</div>
                        {g.feedback}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}

          {unmatched.length > 0 && (
            <>
              <p className="vd-group">Unplaced answers ({unmatched.length})</p>
              {unmatched.map((b, i) => (
                <li key={b.id}>
                  <button className="vd-unmatched-q" onClick={() => props.onSelectBlock(b.id)}>
                    <div className="vd-unmatched-num">?</div>
                    <div className="vd-unmatched-text">
                      {b.label ? `Label: ${b.label} · ` : ""}
                      {b.text.slice(0, 100)}{b.text.length > 100 ? "…" : ""}
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
