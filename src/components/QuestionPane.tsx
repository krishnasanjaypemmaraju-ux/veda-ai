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
  const { summary } = props;

  return (
    <div className="vd-pane">
      <div className="vd-pane-head">
        <h2 className="vd-pane-title">Question paper</h2>
        <p className="vd-pane-meta">
          {props.questions.length} questions, printed order preserved · ↑↓ to step through
        </p>
      </div>

      <div className="vd-summary">
        {summary.awarded !== null && summary.max ? (
          <div className="vd-score">
            <span className="vd-score-value">
              {summary.awarded}/{summary.max}
            </span>
            <span className="vd-score-label">marks awarded</span>
          </div>
        ) : null}

        <div className="vd-tally">
          <span>{summary.answered} answered</span>
          <span>{summary.unanswered} left blank</span>
          <span>{summary.unmatched} unplaced</span>
        </div>

        {summary.overall && <p className="vd-overall">{summary.overall}</p>}

        {(summary.strengths.length > 0 || summary.focus.length > 0) && (
          <ul className="vd-notes">
            {summary.strengths.map((s) => (
              <li key={`s-${s}`}>Solid: {s}</li>
            ))}
            {summary.focus.map((s) => (
              <li key={`f-${s}`}>Work on: {s}</li>
            ))}
          </ul>
        )}
      </div>

      <ul className="vd-qlist">
        {props.questions.map((q) => {
          const match = props.matches.get(q.id);
          const grade = props.grades.get(q.id);
          const active = props.activeQuestionId === q.id;
          const pages = match
            ? [...new Set(match.blockIds.map((id) => props.blocks.get(id)?.page).filter((p) => p !== undefined))]
            : [];

          const statusClass = !match
            ? "s-unanswered"
            : match.method === "semantic"
              ? "s-semantic"
              : "s-answered";
          const statusText = !match
            ? "no answer"
            : match.method === "semantic"
              ? "matched by content"
              : pages.length > 1
                ? `pages ${pages.map((p) => (p as number) + 1).join(", ")}`
                : `page ${(pages[0] as number) + 1}`;

          return (
            <li key={q.id}>
              <button
                className={`vd-q${active ? " is-active" : ""}`}
                onClick={() => props.onSelectQuestion(q.id)}
                aria-pressed={active}
              >
                <span className="vd-q-top">
                  <span className="vd-q-num">{q.number}</span>
                  <span className={`vd-q-status ${statusClass}`}>{statusText}</span>
                </span>
                <p className="vd-q-text">{q.text}</p>
                <span className="vd-q-foot">
                  {q.marks !== null && <span>{q.marks} marks</span>}
                  {q.section && <span>section {q.section}</span>}
                  {grade && (
                    <span className={`vd-verdict v-${grade.verdict}`}>
                      {grade.verdict}
                      {grade.awarded !== null && grade.max !== null
                        ? ` ${grade.awarded}/${grade.max}`
                        : ""}
                    </span>
                  )}
                  {match?.note && <span>{match.note}</span>}
                </span>
                {active && grade?.feedback && <p className="vd-q-feedback">{grade.feedback}</p>}
              </button>
            </li>
          );
        })}
      </ul>

      {props.unmatched.length > 0 && (
        <>
          <p className="vd-group">Written, but not against any question</p>
          <ul className="vd-qlist">
            {props.unmatched.map((b) => (
              <li key={b.id}>
                <button
                  className={`vd-q${props.activeBlockId === b.id ? " is-active" : ""}`}
                  onClick={() => props.onSelectBlock(b.id)}
                >
                  <span className="vd-q-top">
                    <span className="vd-q-num">{b.label ?? "unlabelled"}</span>
                    <span className="vd-q-status s-unanswered">page {b.page + 1}</span>
                  </span>
                  <p className="vd-q-text">{b.text}</p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
