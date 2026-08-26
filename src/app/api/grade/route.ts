import { callGemini, fail, parseJson, resolveKey } from "@/lib/gemini";
import type { Grade, Summary } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM = `You are marking one student's script. You see each question, the marks it carries, and a transcription of what the student wrote.

Rules:
1. Mark the answer that is there, on its merits. Give credit for correct method even when the final value is wrong.
2. awarded must be between 0 and max. If max is null, set awarded null and still give a verdict.
3. verdict is "correct", "partial", "incorrect", or "unanswered" when no answer was submitted.
4. feedback is at most 30 words, addressed to the teacher, naming the specific thing that was right or missing. No praise padding.
5. The transcription may contain [illegible]. Say so in the feedback rather than assuming the worst.
6. In the summary, strengths and focus are at most three short phrases each, drawn from the actual answers.

Return only JSON:
{"grades":[{"questionId":"q-0-1-2a","verdict":"partial","awarded":3,"max":5,"feedback":"..."}],
 "summary":{"overall":"...","strengths":["..."],"focus":["..."]}}`;

export async function POST(req: Request) {
  try {
    const apiKey = resolveKey(req);
    const { items } = (await req.json()) as {
      items: {
        questionId: string;
        number: string;
        question: string;
        answer: string;
        marks: number | null;
      }[];
    };

    const text = await callGemini({
      apiKey,
      system: SYSTEM,
      parts: [{ text: JSON.stringify({ script: items }) }],
      maxOutputTokens: 8192,
    });

    const raw = parseJson<{
      grades?: Grade[];
      summary?: Partial<Summary>;
    }>(text);

    const known = new Map(items.map((i) => [i.questionId, i]));
    const grades: Grade[] = (raw.grades ?? [])
      .filter((g) => known.has(g.questionId))
      .map((g) => {
        const item = known.get(g.questionId)!;
        const max = typeof item.marks === "number" ? item.marks : null;
        let awarded = typeof g.awarded === "number" ? g.awarded : null;
        if (awarded !== null && max !== null) awarded = Math.max(0, Math.min(max, awarded));
        if (max === null) awarded = null;
        return {
          questionId: g.questionId,
          verdict: g.verdict ?? "partial",
          awarded,
          max,
          feedback: (g.feedback ?? "").trim(),
        };
      });

    return Response.json({
      grades,
      summary: {
        overall: raw.summary?.overall ?? "",
        strengths: raw.summary?.strengths ?? [],
        focus: raw.summary?.focus ?? [],
      },
    });
  } catch (err) {
    return fail(err);
  }
}
