"use client";

import { filesToPages } from "./pages";
import type {
  AnswerBlock,
  Grade,
  Match,
  PageImage,
  Progress,
  Question,
  Summary,
} from "./types";

export type Result = {
  questionPages: PageImage[];
  answerPages: PageImage[];
  questions: Question[];
  blocks: AnswerBlock[];
  matches: Match[];
  unansweredIds: string[];
  unmatchedBlockIds: string[];
  grades: Grade[];
  summary: Summary;
};

async function post<T>(path: string, body: unknown, apiKey: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-gemini-key": apiKey } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    throw new Error(`Network error calling ${path}: ${msg}`);
  }

  if (!res.ok) {
    let errorMessage = "";
    try {
      const json = await res.json() as { error?: string };
      errorMessage = json?.error ?? "";
    } catch {
      try {
        const text = await res.text();
        errorMessage = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
      } catch { /* empty */ }
    }
    const status = `HTTP ${res.status}`;
    const detail = errorMessage || res.statusText || "no detail";
    throw new Error(`${path} failed (${status}): ${detail}`);
  }

  return res.json() as Promise<T>;
}

// Process pages in parallel batches to avoid timeouts.
// CONCURRENCY=3 means 3 Gemini calls at once — fast but within free-tier rate limits.
const CONCURRENCY = 3;

async function processInBatches<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((item, j) => fn(item, i + j)));
  }
}

export async function runPipeline(opts: {
  questionFiles: File[];
  answerFiles: File[];
  apiKey: string;
  withGrading: boolean;
  onProgress: (p: Progress) => void;
}): Promise<Result> {
  const { questionFiles, answerFiles, apiKey, withGrading, onProgress } = opts;

  onProgress({ stage: "reading", label: "Reading the question paper…", done: 0, total: 2 });
  const questionPages = await filesToPages(questionFiles);

  onProgress({ stage: "reading", label: "Reading the answer booklet…", done: 1, total: 2 });
  const answerPages = await filesToPages(answerFiles);

  // ── Extract questions (parallel batches) ──────────────────────────────────
  const questions: Question[] = new Array(questionPages.length).fill(null);
  let qDone = 0;

  onProgress({
    stage: "questions",
    label: `Listing questions (${questionPages.length} page${questionPages.length === 1 ? "" : "s"})…`,
    done: 0,
    total: questionPages.length,
  });

  await processInBatches(questionPages, async (page) => {
    const startOrder = page.index * 20; // rough offset; re-sorted after
    const res = await post<{ questions: Question[] }>(
      "/api/extract-questions",
      { image: page.dataUrl, pageIndex: page.index, startOrder },
      apiKey,
    );
    questions[page.index] = res.questions as unknown as Question;
    qDone++;
    onProgress({
      stage: "questions",
      label: `Questions: ${qDone} of ${questionPages.length} pages done…`,
      done: qDone,
      total: questionPages.length,
    });
  });

  // Flatten, preserve page order, assign final order index
  const allQuestions: Question[] = (questions.flat() as unknown as Question[][]).flat();
  allQuestions.forEach((q, i) => (q.order = i));
  const questionNumbers = allQuestions.map((q) => q.number);

  // ── Extract answers (parallel batches) ───────────────────────────────────
  const blocksPerPage: AnswerBlock[][] = new Array(answerPages.length).fill(null);
  let aDone = 0;

  onProgress({
    stage: "answers",
    label: `Reading answers (${answerPages.length} page${answerPages.length === 1 ? "" : "s"})…`,
    done: 0,
    total: answerPages.length,
  });

  await processInBatches(answerPages, async (page) => {
    const res = await post<{ blocks: AnswerBlock[] }>(
      "/api/extract-answers",
      {
        image: page.dataUrl,
        pageIndex: page.index,
        questionNumbers,
        startOrder: page.index * 50,
      },
      apiKey,
    );
    blocksPerPage[page.index] = res.blocks;
    aDone++;
    onProgress({
      stage: "answers",
      label: `Answers: ${aDone} of ${answerPages.length} pages done…`,
      done: aDone,
      total: answerPages.length,
    });
  });

  // Flatten in page order and assign final order index
  const blocks: AnswerBlock[] = (blocksPerPage as unknown as AnswerBlock[][]).flat();
  blocks.forEach((b, i) => (b.order = i));

  // ── Map ───────────────────────────────────────────────────────────────────
  onProgress({ stage: "mapping", label: "Matching answers to questions…", done: 0, total: 1 });
  const mapped = await post<{
    matches: Match[];
    unansweredIds: string[];
    unmatchedBlockIds: string[];
  }>("/api/map", { questions: allQuestions, blocks }, apiKey);

  // ── Grade (optional) ──────────────────────────────────────────────────────
  let grades: Grade[] = [];
  let summaryText = { overall: "", strengths: [] as string[], focus: [] as string[] };

  if (withGrading && allQuestions.length) {
    onProgress({ stage: "grading", label: "Marking and writing feedback…", done: 0, total: 1 });
    const blockById = new Map(blocks.map((b) => [b.id, b]));
    const answerFor = new Map<string, string>();
    for (const m of mapped.matches) {
      const text = m.blockIds
        .map((id) => blockById.get(id)?.text ?? "")
        .filter(Boolean)
        .join("\n");
      answerFor.set(m.questionId, text);
    }
    const items = allQuestions.map((q) => ({
      questionId: q.id,
      number: q.number,
      question: q.text.slice(0, 800),
      answer: (answerFor.get(q.id) ?? "").slice(0, 1500),
      marks: q.marks,
    }));
    try {
      const res = await post<{ grades: Grade[]; summary: typeof summaryText }>(
        "/api/grade",
        { items },
        apiKey,
      );
      grades = res.grades;
      summaryText = res.summary;
    } catch {
      // Grading is optional — mapping still works without it.
    }
  }

  const max = allQuestions.reduce((s, q) => (q.marks ? s + q.marks : s), 0);
  const awarded = grades.reduce((s, g) => (g.awarded !== null ? s + g.awarded : s), 0);

  const summary: Summary = {
    max: max || null,
    awarded: grades.length ? awarded : null,
    answered: mapped.matches.length,
    unanswered: mapped.unansweredIds.length,
    unmatched: mapped.unmatchedBlockIds.length,
    overall: summaryText.overall,
    strengths: summaryText.strengths,
    focus: summaryText.focus,
  };

  onProgress({ stage: "ready", label: "Done!", done: 1, total: 1 });

  return {
    questionPages,
    answerPages,
    questions: allQuestions,
    blocks,
    matches: mapped.matches,
    unansweredIds: mapped.unansweredIds,
    unmatchedBlockIds: mapped.unmatchedBlockIds,
    grades,
    summary,
  };
}
