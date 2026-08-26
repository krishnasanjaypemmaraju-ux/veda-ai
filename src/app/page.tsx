"use client";

import { useEffect, useMemo, useState } from "react";
import QuestionPane from "@/components/QuestionPane";
import SheetPane from "@/components/SheetPane";
import Uploader from "@/components/Uploader";
import { runPipeline, type Result } from "@/lib/pipeline";
import type { Progress } from "@/lib/types";

export default function Page() {
  const [questionFiles, setQuestionFiles] = useState<File[]>([]);
  const [answerFiles, setAnswerFiles] = useState<File[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [needsKey, setNeedsKey] = useState(false);
  const [withGrading, setWithGrading] = useState(true);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => setNeedsKey(!s.hasServerKey))
      .catch(() => setNeedsKey(true));
  }, []);

  const start = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await runPipeline({
        questionFiles,
        answerFiles,
        apiKey,
        withGrading,
        onProgress: setProgress,
      });
      setResult(res);
      const firstAnswered = res.matches[0]?.questionId ?? null;
      setActiveQuestionId(firstAnswered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setResult(null);
    setProgress(null);
    setError(null);
    setActiveQuestionId(null);
    setActiveBlockId(null);
  };

  // Arrow keys walk the paper, so a teacher can review a script without a mouse.
  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      e.preventDefault();
      const ids = result.questions.map((q) => q.id);
      const at = activeQuestionId ? ids.indexOf(activeQuestionId) : -1;
      const next = e.key === "ArrowDown" ? at + 1 : at - 1;
      if (next >= 0 && next < ids.length) {
        setActiveBlockId(null);
        setActiveQuestionId(ids[next]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, activeQuestionId]);

  const exportCsv = () => {
    if (!result) return;
    const blockById = new Map(result.blocks.map((b) => [b.id, b]));
    const matchById = new Map(result.matches.map((m) => [m.questionId, m]));
    const gradeById = new Map(result.grades.map((g) => [g.questionId, g]));
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Question", "Status", "Pages", "Marks awarded", "Out of", "Verdict", "Feedback", "Answer"],
      ...result.questions.map((q) => {
        const m = matchById.get(q.id);
        const g = gradeById.get(q.id);
        const pages = m
          ? [...new Set(m.blockIds.map((id) => (blockById.get(id)?.page ?? 0) + 1))].join(" ")
          : "";
        const answer = m
          ? m.blockIds.map((id) => blockById.get(id)?.text ?? "").filter(Boolean).join(" ")
          : "";
        return [
          q.number,
          m ? "answered" : "blank",
          pages,
          g?.awarded ?? "",
          q.marks ?? "",
          g?.verdict ?? "",
          g?.feedback ?? "",
          answer,
        ];
      }),
    ];
    const csv = rows.map((r) => r.map(cell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "marks.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const derived = useMemo(() => {
    if (!result) return null;
    const matches = new Map(result.matches.map((m) => [m.questionId, m]));
    const grades = new Map(result.grades.map((g) => [g.questionId, g]));
    const blocks = new Map(result.blocks.map((b) => [b.id, b]));
    const unmatchedIds = new Set(result.unmatchedBlockIds);
    const unmatched = result.blocks.filter((b) => unmatchedIds.has(b.id) && b.text);
    return { matches, grades, blocks, unmatched };
  }, [result]);

  const activeBlockIds = useMemo(() => {
    if (!result || !derived) return [];
    if (activeQuestionId) {
      const match = derived.matches.get(activeQuestionId);
      if (!match) return [];
      // Pull in the extra boxes that belong to the same handwriting block.
      const base = new Set(match.blockIds);
      return result.blocks
        .filter((b) => base.has(b.id) || [...base].some((id) => b.id.startsWith(`${id}-x`)))
        .map((b) => b.id);
    }
    if (activeBlockId) return [activeBlockId];
    return [];
  }, [result, derived, activeQuestionId, activeBlockId]);

  const activeLabel = useMemo(() => {
    if (!result) return null;
    if (activeQuestionId) {
      return result.questions.find((q) => q.id === activeQuestionId)?.number ?? null;
    }
    if (activeBlockId) {
      const b = result.blocks.find((x) => x.id === activeBlockId);
      return b?.label ?? "unlabelled answer";
    }
    return null;
  }, [result, activeQuestionId, activeBlockId]);

  const selectQuestion = (id: string) => {
    setActiveBlockId(null);
    setActiveQuestionId((current) => (current === id ? null : id));
  };

  const selectBlock = (id: string) => {
    if (!result) return;
    const owner = result.matches.find((m) => m.blockIds.includes(id));
    if (owner) {
      setActiveBlockId(null);
      setActiveQuestionId(owner.questionId);
      return;
    }
    setActiveQuestionId(null);
    setActiveBlockId((current) => (current === id ? null : id));
  };

  return (
    <div className="vd-app">
      <header className="vd-top">
        <h1 className="vd-wordmark">
          Marking Desk <span>· VedaAI</span>
        </h1>
        {result && (
          <div className="vd-top-files">
            <span className="vd-chip">{result.questions.length} questions</span>
            <span className="vd-chip">{result.answerPages.length} sheet pages</span>
            <button className="vd-restart" onClick={exportCsv}>
              Export marks
            </button>
            <button className="vd-restart" onClick={reset}>
              Mark another script
            </button>
          </div>
        )}
      </header>

      {!result || !derived ? (
        <Uploader
          questionFiles={questionFiles}
          answerFiles={answerFiles}
          setQuestionFiles={setQuestionFiles}
          setAnswerFiles={setAnswerFiles}
          apiKey={apiKey}
          setApiKey={setApiKey}
          needsKey={needsKey}
          withGrading={withGrading}
          setWithGrading={setWithGrading}
          onStart={start}
          running={running}
          progress={progress}
          error={error}
        />
      ) : (
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
            onClear={() => {
              setActiveQuestionId(null);
              setActiveBlockId(null);
            }}
          />
        </main>
      )}
    </div>
  );
}
