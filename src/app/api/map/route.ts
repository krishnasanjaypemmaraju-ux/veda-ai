import { callGemini, fail, parseJson, resolveKey } from "@/lib/gemini";
import { applySemantic, deterministicMatch } from "@/lib/mapping";
import type { AnswerBlock, Question } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You place stray answers. A student wrote some answers without a question number, and the numbered ones have already been placed.

For each unplaced answer, decide which of the still-unanswered questions it responds to.

Rules:
1. Match on substance: the topic, quantities, method, shape of working.
2. An answer may belong to none of them — say so with questionId null. Wrong guesses are worse than leaving it unplaced.
3. Never place two answers on the same question.
4. confidence is 0-1. Use below 0.5 when unsure.
5. note is at most 12 words saying why it matches, for the teacher to verify.

Return only JSON:
{"placements":[{"blockId":"a-1-2","questionId":"q-0-3-4b","confidence":0.8,"note":"solves the same integral"}]}`;

export async function POST(req: Request) {
  try {
    const { questions, blocks } = (await req.json()) as {
      questions: Question[];
      blocks: AnswerBlock[];
    };

    const base = deterministicMatch(questions, blocks);
    let matches = base.matches;
    let orphans = base.orphans.filter((b) => b.text.replace(/\u200b/g, "").trim().length > 0);
    let unanswered = base.unanswered;

    // Semantic pass: try to place unlabelled orphans against unanswered questions.
    if (orphans.length && unanswered.length) {
      try {
        const apiKey = resolveKey(req);
        const payload = {
          unanswered_questions: unanswered.map((q) => ({
            questionId: q.id,
            number: q.number,
            text: q.text.slice(0, 600),
          })),
          unplaced_answers: orphans.map((b) => ({
            blockId: b.id,
            page: b.page + 1,
            text: b.text.slice(0, 900),
          })),
        };

        const text = await callGemini({
          apiKey,
          system: SYSTEM,
          parts: [{ text: JSON.stringify(payload) }],
          maxOutputTokens: 4096,
        });

        const raw = parseJson<{
          placements?: {
            blockId: string;
            questionId: string | null;
            confidence?: number;
            note?: string;
          }[];
        }>(text);

        const validQ = new Set(unanswered.map((q) => q.id));
        const validB = new Set(orphans.map((b) => b.id));
        const usedQ = new Set<string>();

        const suggestions = (raw.placements ?? [])
          .filter((p) => p.questionId && validQ.has(p.questionId) && validB.has(p.blockId))
          .filter((p) => { if (usedQ.has(p.questionId!)) return false; usedQ.add(p.questionId!); return true; })
          .map((p) => ({
            blockId: p.blockId,
            questionId: p.questionId!,
            confidence: typeof p.confidence === "number" ? p.confidence : 0.5,
            note: p.note,
          }));

        const applied = applySemantic(matches, suggestions);
        matches = applied.matches;
        orphans = orphans.filter((b) => !applied.placed.has(b.id));
        const answered = new Set(matches.map((m) => m.questionId));
        unanswered = questions.filter((q) => !answered.has(q.id));
      } catch {
        // Semantic pass is a bonus. Label-based mapping still stands.
      }
    }

    return Response.json({
      matches,
      unansweredIds: unanswered.map((q) => q.id),
      unmatchedBlockIds: orphans.map((b) => b.id),
    });
  } catch (err) {
    return fail(err);
  }
}
