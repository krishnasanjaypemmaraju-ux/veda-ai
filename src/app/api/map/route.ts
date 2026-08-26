import { callGemini, fail, parseJson, resolveKey } from "@/lib/gemini";
import { applySemantic, deterministicMatch } from "@/lib/mapping";
import type { AnswerBlock, Question } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You place stray answers. A student wrote some answers without a question number, and the numbered ones have already been placed.

For each unplaced answer, decide which of the still-unanswered questions it responds to.

Rules:
1. Match on substance: the topic, the quantities, the method, the shape of the working.
2. An answer may belong to none of them. Say so with questionId null. Wrong guesses are worse than leaving it unplaced, because a teacher will trust what you return.
3. Never place two different answers on the same question, and never place one answer on two questions.
4. confidence is 0 to 1. Use below 0.5 when you are unsure.
5. note is at most 12 words on why it matches, for the teacher to check.

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
    let orphans = base.orphans.filter((b) => b.text.trim().length > 0);
    let unanswered = base.unanswered;

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
          placements?: { blockId: string; questionId: string | null; confidence?: number; note?: string }[];
        }>(text);

        const validQuestions = new Set(unanswered.map((q) => q.id));
        const validBlocks = new Set(orphans.map((b) => b.id));
        const usedQuestions = new Set<string>();
        const suggestions = (raw.placements ?? [])
          .filter((p) => p.questionId && validQuestions.has(p.questionId) && validBlocks.has(p.blockId))
          .filter((p) => {
            if (usedQuestions.has(p.questionId!)) return false;
            usedQuestions.add(p.questionId!);
            return true;
          })
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
        // Semantic matching is a bonus pass. If it fails, the label-based
        // mapping still stands and the strays stay visible as unmatched.
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
