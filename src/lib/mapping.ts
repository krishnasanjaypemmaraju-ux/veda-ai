import type { AnswerBlock, Match, Question, Rect, Region } from "./types";

// Normalise a question label so "Q.11(a)", "11 a", "11(a)" all match.
export function normaliseLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/^q\.?\s*/i, "")
    .replace(/[^a-z0-9]/g, "");
}

// Convert Gemini box_2d ([ymin,xmin,ymax,xmax] in 0-1000) to percent Rect.
export function boxToRect(box: number[] | undefined | null): Rect | null {
  if (!box || box.length < 4) return null;
  const [ymin, xmin, ymax, xmax] = box;
  if ([ymin, xmin, ymax, xmax].some((v) => typeof v !== "number")) return null;
  const x = Math.max(0, xmin / 10 - 1);
  const y = Math.max(0, ymin / 10 - 1);
  const w = Math.min(100 - x, (xmax - xmin) / 10 + 2);
  const h = Math.min(100 - y, (ymax - ymin) / 10 + 2);
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

// Merge multiple regions (for multi-page/multi-block highlights).
export function mergeRegions(regions: Region[]): Region[] {
  return regions; // Return as-is; each block keeps its own rect.
}

// Label-based match: for each question, find all answer blocks whose
// normalised label matches the question's normalised number.
// Handles out-of-order answers, multiple blocks per question, continuation.
export function deterministicMatch(
  questions: Question[],
  blocks: AnswerBlock[],
): { matches: Match[]; orphans: AnswerBlock[]; unanswered: Question[] } {
  const questionsByKey = new Map<string, Question>();
  for (const q of questions) {
    const k = normaliseLabel(q.number);
    if (k) questionsByKey.set(k, q);
  }

  const matched = new Map<string, string[]>(); // questionId -> blockIds
  const orphans: AnswerBlock[] = [];

  for (const block of blocks) {
    // Skip zero-width space sentinel blocks in matching logic.
    const realText = block.text.replace(/\u200b/g, "").trim();
    if (!realText) continue;

    const k = block.key;
    const q = k ? questionsByKey.get(k) : undefined;

    if (q) {
      const arr = matched.get(q.id) ?? [];
      arr.push(block.id);
      matched.set(q.id, arr);
    } else {
      orphans.push(block);
    }
  }

  const matches: Match[] = [];
  for (const [questionId, blockIds] of matched) {
    matches.push({ questionId, blockIds, method: "label", confidence: 1.0 });
  }

  const answeredIds = new Set(matched.keys());
  const unanswered = questions.filter((q) => !answeredIds.has(q.id));

  return { matches, orphans, unanswered };
}

// Apply semantic placement suggestions from Gemini.
export function applySemantic(
  existing: Match[],
  suggestions: { blockId: string; questionId: string; confidence: number; note?: string }[],
): { matches: Match[]; placed: Set<string> } {
  const byQuestion = new Map(existing.map((m) => [m.questionId, m]));
  const placed = new Set<string>();

  for (const s of suggestions) {
    if (s.confidence < 0.4) continue;
    const existing2 = byQuestion.get(s.questionId);
    if (existing2) {
      existing2.blockIds.push(s.blockId);
      existing2.method = "semantic";
      existing2.note = s.note;
    } else {
      byQuestion.set(s.questionId, {
        questionId: s.questionId,
        blockIds: [s.blockId],
        method: "semantic",
        confidence: s.confidence,
        note: s.note,
      });
    }
    placed.add(s.blockId);
  }

  return { matches: [...byQuestion.values()], placed };
}
