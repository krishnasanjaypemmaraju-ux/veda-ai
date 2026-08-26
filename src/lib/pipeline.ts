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
    // Try to read a JSON body first (our fail() always returns JSON).
    // If that fails, try text. If that fails, use the status line.
    let errorMessage = "";
    try {
      const json = await res.json() as { error?: string };
      errorMessage = json?.error ?? "";
    } catch {
      try {
        const text = await res.text();
        // If it's an HTML page (Vercel error, proxy error) strip the tags.
        errorMessage = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
      } catch {
        /* empty */
      }
    }

    // Build the most informative message possible.
    const status = `HTTP ${res.status}`;
    const detail = errorMessage || res.statusText || "no detail";
    throw new Error(`${path} failed (${status}): ${detail}`);
  }

  return res.json() as Promise<T>;
}

const breathe = () => new Promise((r) => setTimeout(r, 350));

export async function runPipeline(opts: {
  questionFiles: File[];
  answerFiles: File[];
  apiKey: string;
  withGrading: boolean;
  onProgress: (p: Progress) => void;
}): Promise<Result> {
  const { questionFiles, answerFiles, apiKey, withGrading, onProgress } = opts;

  onProgress({ stage: "reading", label: "Reading the question paper", done: 0, total: 2 });
  const questionPages = await filesToPages(questionFiles);

  onProgress({ stage: "reading", label: "Reading the answer booklet", done: 1, total: 2 });
  const answerPages = await filesToPages(answerFiles);

  const questions: Question[] = [];
  for (const page of questionPages) {
    onProgress({
      stage: "questions",
      label: `Listing questions, page ${page.index + 1} of ${questionPages.length}`,
      done: page.index,
      total: questionPages.length,
    });
    const res = await post<{ questions: Question[] }>(
      "/api/extract-questions",
      { image: page.dataUrl, pageIndex: page.index, startOrder: questions.length },
      apiKey,
    );
    questions.push(...res.questions);
    await breathe();
  }
  questions.forEach((q, i) => (q.order = i));

  const questionNumbers = questions.map((q) => q.number);
  const blocks: AnswerBlock[] = [];
  for (const page of answerPages) {
    onProgress({
      stage: "answers",
      label: `Reading handwriting, page ${page.index + 1} of ${answerPages.length}`,
      done: page.index,
      total: answerPages.length,
    });
    const res = await post<{ blocks: AnswerBlock[] }>(
      "/api/extract-answers",
      {
        image: page.dataUrl,
        pageIndex: page.index,
        questionNumbers,
        startOrder: blocks.length,
      },
      apiKey,
    );
    blocks.push(...res.blocks);
    await breathe();
  }

  onProgress({ stage: "mapping", label: "Matching answers to questions", done: 0, total: 1 });
  const mapped = await post<{
    matches: Match[];
    unansweredIds: string[];
    unmatchedBlockIds: string[];
  }>("/api/map", { questions, blocks }, apiKey);

  let grades: Grade[] = [];
  let summaryText = { overall: "", strengths: [] as string[], focus: [] as string[] };

  if (withGrading && questions.length) {
    onProgress({ stage: "grading", label: "Marking and writing feedback", done: 0, total: 1 });
    const blockById = new Map(blocks.map((b) => [b.id, b]));
    const answerFor = new Map<string, string>();
    for (const m of mapped.matches) {
      const text = m.blockIds
        .map((id) => blockById.get(id)?.text ?? "")
        .filter(Boolean)
        .join("\n");
      answerFor.set(m.questionId, text);
    }
    const items = questions.map((q) => ({
      questionId: q.id,
      number: q.number,
      question: q.text.slice(0, 800),
      answer: answerFor.get(q.id)?.slice(0, 1500) ?? "",
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
      // Marking is optional. Mapping is the product; feedback is the garnish.
    }
  }

  const max = questions.reduce((sum, q) => (q.marks ? sum + q.marks : sum), 0);
  const awarded = grades.reduce((sum, g) => (g.awarded !== null ? sum + g.awarded : sum), 0);

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

  onProgress({ stage: "ready", label: "Done", done: 1, total: 1 });

  return {
    questionPages,
    answerPages,
    questions,
    blocks,
    matches: mapped.matches,
    unansweredIds: mapped.unansweredIds,
    unmatchedBlockIds: mapped.unmatchedBlockIds,
    grades,
    summary,
  };
}
