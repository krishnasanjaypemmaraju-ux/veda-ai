import type { AnswerBlock, Match, Question, Rect, Region } from "./types";

/**
 * Turns everything a student or a printer might write for a question number
 * into one comparable key: "Q.11 (a)", "11a.", "11 A)" -> "11a".
 */
export function normaliseLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).toLowerCase();
  s = s.replace(/^(ans(wer)?|sol(ution)?|q(uestion)?|no)[.\s:-]*/g, "");
  s = s.replace(/[^a-z0-9]/g, "");
  s = s.replace(/^0+(?=\d)/, "");
  return s.length ? s : null;
}

/** Roman numerals used for sub-sub-parts, so (ii) and (b) stay distinct. */
export function labelVariants(key: string): string[] {
  const out = new Set<string>([key]);
  const m = key.match(/^(\d+)([a-z]+)$/);
  if (m) {
    out.add(`${m[1]}${m[2]}`);
    out.add(`${m[1]}.${m[2]}`);
  }
  return [...out];
}

export function clampRect(r: Rect): Rect {
  const x = Math.max(0, Math.min(100, r.x));
  const y = Math.max(0, Math.min(100, r.y));
  return {
    x,
    y,
    w: Math.max(0.5, Math.min(100 - x, r.w)),
    h: Math.max(0.5, Math.min(100 - y, r.h)),
  };
}

/** Gemini returns [ymin, xmin, ymax, xmax] normalised to 0-1000. */
export function boxToRect(box: number[] | undefined | null): Rect | null {
  if (!Array.isArray(box) || box.length < 4) return null;
  const [ymin, xmin, ymax, xmax] = box.map(Number);
  if ([ymin, xmin, ymax, xmax].some((n) => !Number.isFinite(n))) return null;
  const rect = {
    x: xmin / 10,
    y: ymin / 10,
    w: (xmax - xmin) / 10,
    h: (ymax - ymin) / 10,
  };
  if (rect.w <= 0 || rect.h <= 0) return null;
  // A little breathing room so descenders and margin working aren't clipped.
  return clampRect({ x: rect.x - 1.2, y: rect.y - 1, w: rect.w + 2.4, h: rect.h + 2 });
}

export function mergeRegions(regions: Region[]): Region[] {
  const byPage = new Map<number, Region[]>();
  for (const r of regions) {
    const list = byPage.get(r.page) ?? [];
    list.push(r);
    byPage.set(r.page, list);
  }
  const out: Region[] = [];
  for (const [page, list] of byPage) {
    const sorted = [...list].sort((a, b) => a.rect.y - b.rect.y);
    let current = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      const currentBottom = current.rect.y + current.rect.h;
      // Vertically adjacent strips of the same answer read better as one band.
      if (next.rect.y - currentBottom < 2.5) {
        const top = Math.min(current.rect.y, next.rect.y);
        const bottom = Math.max(currentBottom, next.rect.y + next.rect.h);
        const left = Math.min(current.rect.x, next.rect.x);
        const right = Math.max(
          current.rect.x + current.rect.w,
          next.rect.x + next.rect.w,
        );
        current = { page, rect: clampRect({ x: left, y: top, w: right - left, h: bottom - top }) };
      } else {
        out.push(current);
        current = next;
      }
    }
    out.push(current);
  }
  return out.sort((a, b) => a.page - b.page || a.rect.y - b.rect.y);
}

/**
 * Pass 1 of mapping: everything we can settle without asking a model.
 * Handles explicit labels, out-of-order answers and page-spanning answers.
 */
export function deterministicMatch(questions: Question[], blocks: AnswerBlock[]) {
  const byKey = new Map<string, Question>();
  for (const q of questions) {
    for (const v of labelVariants(q.key)) if (!byKey.has(v)) byKey.set(v, q);
  }

  const matches = new Map<string, Match>();
  const claimed = new Set<string>();
  const ordered = [...blocks].sort((a, b) => a.page - b.page || a.order - b.order);

  // Owner of the block immediately before this one in reading order. A runover
  // may only attach to that, so a stray in between breaks the chain instead of
  // silently swallowing later writing.
  let previousOwner: string | null = null;

  for (const block of ordered) {
    const key = block.key ?? normaliseLabel(block.label);
    const q = key ? byKey.get(key) : undefined;

    if (q) {
      const existing = matches.get(q.id);
      if (existing) {
        existing.blockIds.push(block.id);
      } else {
        matches.set(q.id, {
          questionId: q.id,
          blockIds: [block.id],
          method: "label",
          confidence: Math.max(0.9, block.confidence),
        });
      }
      claimed.add(block.id);
      previousOwner = q.id;
      continue;
    }

    // Unlabelled block directly following a placed one: a runover, including
    // the case where the answer carries onto the next page.
    if (!key && previousOwner && block.continuation) {
      const existing = matches.get(previousOwner);
      if (existing) {
        existing.blockIds.push(block.id);
        if (existing.method === "label") existing.method = "continuation";
        claimed.add(block.id);
        continue;
      }
    }

    // The student wrote a number that no question carries, or wrote nothing at
    // all where we cannot infer an owner. Either way the chain stops here.
    previousOwner = null;
  }

  const orphans = ordered.filter((b) => !claimed.has(b.id));
  const answeredIds = new Set(matches.keys());
  const unanswered = questions.filter((q) => !answeredIds.has(q.id));

  return { matches: [...matches.values()], orphans, unanswered };
}

/** Applies the model's semantic suggestions for blocks no label could place. */
export function applySemantic(
  matches: Match[],
  suggestions: { blockId: string; questionId: string | null; confidence: number; note?: string }[],
  minConfidence = 0.55,
) {
  const byQuestion = new Map(matches.map((m) => [m.questionId, m]));
  const placed = new Set<string>();

  for (const s of suggestions) {
    if (!s.questionId || s.confidence < minConfidence) continue;
    const existing = byQuestion.get(s.questionId);
    if (existing) {
      existing.blockIds.push(s.blockId);
      existing.note = s.note;
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
