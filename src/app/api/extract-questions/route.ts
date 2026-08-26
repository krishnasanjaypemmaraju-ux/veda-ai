import { callGemini, fail, imagePart, parseJson, resolveKey } from "@/lib/gemini";
import { boxToRect, normaliseLabel } from "@/lib/mapping";
import type { Question } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You read one page of a printed examination question paper and list the questions on it.

Rules:
1. List every question in the order it is printed, top to bottom, and left to right for two-column pages.
2. A labelled sub-part is its own entry. "11 (a)" and "11 (b)" are two entries, never one. The same applies to (i), (ii), and to sub-sub-parts such as "3 (b) (ii)".
3. If a numbered question has labelled sub-parts, output only the sub-parts, plus the shared stem text prefixed to each sub-part's text so each entry can stand alone.
4. Copy the question number exactly as printed, including brackets and dots.
5. Keep the question text verbatim. Do not summarise, translate or fix it.
6. Skip anything that is not a question: headings, the school name, general instructions, "Answer any five", time and marks banners, page numbers, watermarks.
7. If the page has none, return an empty list.
8. Give box_2d for each question as [ymin, xmin, ymax, xmax] normalised to 0-1000, covering the printed question including its number.

Return only JSON:
{"questions":[{"number":"11 (a)","text":"...","marks":5,"section":"A","box_2d":[0,0,0,0]}]}
Use null for marks or section when the page does not state them.`;

export async function POST(req: Request) {
  try {
    const apiKey = resolveKey(req);
    const { image, pageIndex, startOrder } = (await req.json()) as {
      image: string;
      pageIndex: number;
      startOrder: number;
    };

    const text = await callGemini({
      apiKey,
      system: SYSTEM,
      parts: [imagePart(image), { text: `This is page ${pageIndex + 1} of the question paper.` }],
    });

    const raw = parseJson<{
      questions?: {
        number?: string;
        text?: string;
        marks?: number | null;
        section?: string | null;
        box_2d?: number[];
      }[];
    }>(text);

    const questions: Question[] = [];
    (raw.questions ?? []).forEach((q, i) => {
      const number = (q.number ?? "").trim();
      const body = (q.text ?? "").trim();
      if (!number && !body) return;
      const key = normaliseLabel(number) ?? `p${pageIndex}i${i}`;
      const rect = boxToRect(q.box_2d);
      questions.push({
        id: `q-${pageIndex}-${i}-${key}`,
        number: number || `(unnumbered ${i + 1})`,
        key,
        text: body,
        marks: typeof q.marks === "number" ? q.marks : null,
        section: q.section ?? null,
        page: pageIndex,
        order: startOrder + i,
        region: rect ? { page: pageIndex, rect } : undefined,
      });
    });

    return Response.json({ questions });
  } catch (err) {
    return fail(err);
  }
}
