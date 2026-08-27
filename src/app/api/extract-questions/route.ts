import { callGemini, fail, imagePart, parseJson, resolveKey } from "@/lib/gemini";
import { boxToRect, normaliseLabel } from "@/lib/mapping";
import type { Question } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SYSTEM = `You read one page of a printed question paper and list every question on it.

Rules:
1. Preserve printed order top-to-bottom.
2. Treat every sub-part as its own question: "11(a)", "11(b)", "3(b)(i)", "3(b)(ii)".
3. number is the label exactly as printed: "11(a)", "Q.3", "5.b.ii".
4. text is the full question text, including any sub-question context needed to answer it.
5. marks is the integer mark allocation if printed (e.g. "[5]", "(3 marks)"), otherwise null.
6. section is the section heading if the question falls under one (e.g. "Section B"), otherwise null.
7. box_2d is optional: [ymin, xmin, ymax, xmax] normalised 0-1000 tightly around the question. Omit if unsure.
8. If the page has no questions (e.g. a cover page), return an empty list.

Return only JSON:
{"questions":[{"number":"11(a)","text":"...","marks":5,"section":"B","box_2d":[0,0,100,100]}]}`;

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
      parts: [
        imagePart(image),
        { text: `This is page ${pageIndex + 1} of the question paper.` },
      ],
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

    const questions: Question[] = (raw.questions ?? [])
      .filter((q) => q.number && q.text)
      .map((q, i) => ({
        id: `q-${pageIndex}-${startOrder + i}-${normaliseLabel(q.number)}`,
        number: String(q.number!).trim(),
        text: String(q.text!).trim(),
        marks: typeof q.marks === "number" ? q.marks : null,
        section: q.section ? String(q.section).trim() : null,
        order: startOrder + i,
      }));

    return Response.json({ questions });
  } catch (err) {
    return fail(err);
  }
}
