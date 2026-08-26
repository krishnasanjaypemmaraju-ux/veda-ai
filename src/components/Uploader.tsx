"use client";

import { useRef, useState } from "react";
import type { Progress, Stage } from "@/lib/types";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "reading", label: "Turn the uploads into pages" },
  { stage: "questions", label: "List every question in printed order" },
  { stage: "answers", label: "Read the handwriting and locate each answer" },
  { stage: "mapping", label: "Match answers to questions" },
  { stage: "grading", label: "Mark and write feedback" },
];

function Drop(props: {
  role: string;
  title: string;
  hint: string;
  files: File[];
  onFiles: (files: File[]) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      className={`vd-drop${over ? " is-over" : ""}${props.files.length ? " is-set" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (props.disabled) return;
        props.onFiles([...e.dataTransfer.files]);
      }}
    >
      <p className="vd-drop-role">{props.role}</p>
      <h2 className="vd-drop-title">{props.title}</h2>
      <p className="vd-drop-hint">{props.hint}</p>
      {props.files.length > 0 && (
        <ul className="vd-drop-list">
          {props.files.map((f) => (
            <li key={f.name}>{f.name}</li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => props.onFiles([...(e.target.files ?? [])])}
      />
      <button
        type="button"
        className="vd-restart"
        style={{ marginTop: 14, borderColor: "var(--hair)", color: "var(--ink-2)" }}
        onClick={() => input.current?.click()}
        disabled={props.disabled}
      >
        {props.files.length ? "Choose different files" : "Choose files"}
      </button>
    </div>
  );
}

export default function Uploader(props: {
  questionFiles: File[];
  answerFiles: File[];
  setQuestionFiles: (f: File[]) => void;
  setAnswerFiles: (f: File[]) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  needsKey: boolean;
  withGrading: boolean;
  setWithGrading: (v: boolean) => void;
  onStart: () => void;
  running: boolean;
  progress: Progress | null;
  error: string | null;
}) {
  const ready =
    props.questionFiles.length > 0 &&
    props.answerFiles.length > 0 &&
    (!props.needsKey || props.apiKey.trim().length > 10);

  const activeIndex = STEPS.findIndex((s) => s.stage === props.progress?.stage);
  const pct = props.progress?.total
    ? Math.round(((props.progress.done + 0.5) / props.progress.total) * 100)
    : 0;

  return (
    <div className="vd-landing">
      <div className="vd-landing-inner">
        <p className="vd-eyebrow">Question paper → answer sheet</p>
        <h1 className="vd-lede">Find every answer on the page.</h1>
        <p className="vd-sub">
          Upload the paper and one student&apos;s booklet. Click a question and the exact patch of
          handwriting that answers it lights up, wherever the student put it. Questions with nothing
          against them stay visible instead of quietly disappearing.
        </p>

        <div className="vd-drops">
          <Drop
            role="Upload one"
            title="Question paper"
            hint="PDF, or page images. Printed."
            files={props.questionFiles}
            onFiles={props.setQuestionFiles}
            disabled={props.running}
          />
          <Drop
            role="Upload two"
            title="Answer booklet"
            hint="PDF, or page images. One student, handwritten."
            files={props.answerFiles}
            onFiles={props.setAnswerFiles}
            disabled={props.running}
          />
        </div>

        <div className="vd-options">
          <label className="vd-check">
            <input
              type="checkbox"
              checked={props.withGrading}
              onChange={(e) => props.setWithGrading(e.target.checked)}
              disabled={props.running}
            />
            <span>Mark the script and write per-question feedback. Adds one pass.</span>
          </label>

          {props.needsKey && (
            <label className="vd-key">
              <span className="vd-key-label">
                Gemini API key. This deployment has no server key, so paste your own — it stays in
                this tab and is sent only with your own requests. Free keys: aistudio.google.com/apikey
              </span>
              <input
                type="password"
                value={props.apiKey}
                placeholder="AIza…"
                onChange={(e) => props.setApiKey(e.target.value)}
                disabled={props.running}
              />
            </label>
          )}
        </div>

        <button className="vd-go" onClick={props.onStart} disabled={!ready || props.running}>
          {props.running ? "Working…" : "Start marking"}
        </button>

        {props.error && <div className="vd-error">{props.error}</div>}

        {props.running && props.progress && (
          <div className="vd-progress">
            <ol className="vd-steps">
              {STEPS.map((step, i) => {
                const state =
                  i < activeIndex ? " is-done" : i === activeIndex ? " is-active" : "";
                return (
                  <li key={step.stage} className={`vd-step${state}`}>
                    <span className="vd-step-num">{String(i + 1).padStart(2, "0")}</span>
                    <span>{step.label}</span>
                  </li>
                );
              })}
            </ol>
            <div className="vd-bar">
              <div className="vd-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <p className="vd-bar-note">{props.progress.label}</p>
          </div>
        )}
      </div>
    </div>
  );
}
