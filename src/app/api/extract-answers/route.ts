import { callGemini, fail, imagePart, parseJson, resolveKey } from "@/lib/gemini";
import { boxToRect, normaliseLabel } from "@/lib/mapping";
import type { AnswerBlock } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SYSTEM = `You read one page of a student's handwritten answer booklet and extract answer blocks.

An answer block is one continuous stretch of handwriting that belongs to a single question.

Rules:
1. Work top-to-bottom. For a two-column page, finish the left column before the right.
2. label is the question number the student actually wrote next to that block (e.g. "11(a)", "Q.3", "5 b"). If the student wrote no number, label must be null. Never guess.
3. continuation is true when a block carries on from earlier writing with no new label (mid-sentence start, "contd", "P.T.O.", etc.).
4. text is a faithful transcription. Keep formulas, units, and working. Write [illegible] where unreadable. Do not correct mistakes.
5. box_2d is [ymin, xmin, ymax, xmax] normalised 0-1000. Must tightly enclose the entire block including the student's question number.
6. If one answer has a diagram or table set apart from the text, include it in extra_boxes.
7. Ignore printed page furniture: ruled lines, margins, page numbers, booklet headers, roll-number boxes.
8. confidence is 0-1 for how sure you are of the label and boundaries.
9. If the page is blank, return an empty list.

Return only JSON:
{"blocks":[{"label":"11(a)","text":"...","box_2d":[0,0,100,100],"extra_boxes":[],"continuation":false,"confidence":0.9}]}`;

export async function POST(req: Request) {
  try {
    const apiKey = resolveKey(req);
    const { image, pageIndex, questionNumbers, startOrder } = (await req.json()) as {
      image: string;
      pageIndex: number;
      questionNumbers: string[];
      startOrder: number;
    };

    const hint = questionNumbers?.length
      ? `The question paper has these question numbers: ${questionNumbers.join(", ")}. Use this only to read an ambiguous handwritten number correctly. If the student wrote no number, label stays null.`
      : "";

    const text = await callGemini({
      apiKey,
      system: SYSTEM,
      parts: [
        imagePart(image),
        { text: `This is page ${pageIndex + 1} of the answer booklet. ${hint}` },
      ],
    });

    const raw = parseJson<{
      blocks?: {
        label?: string | null;
        text?: string;
        box_2d?: number[];
        extra_boxes?: number[][];
        continuation?: boolean;
        confidence?: number;
      }[];
    }>(text);

    const blocks: AnswerBlock[] = [];

    (raw.blocks ?? []).forEach((b, i) => {
      const rect = boxToRect(b.box_2d);
      if (!rect) return;
      const body = (b.text ?? "").trim();
      if (!body) return; // skip empty blocks
      const label = b.label ? String(b.label).trim() : null;
      const id = `a-${pageIndex}-${i}`;

      blocks.push({
        id,
        page: pageIndex,
        label,
        key: normaliseLabel(label),
        text: body,
        region: { page: pageIndex, rect },
        continuation: Boolean(b.continuation) || !label,
        confidence: typeof b.confidence === "number" ? b.confidence : 0.6,
        order: startOrder + i,
      });

      // extra_boxes: additional spatial regions for the same answer (diagrams, tables).
      // Use zero-width space as text so they are truthy (don't break counting)
      // but render blank — SheetPane filters them from the idle click target list.
      for (const extra of b.extra_boxes ?? []) {
        const extraRect = boxToRect(extra);
        if (!extraRect) continue;
        blocks.push({
          id: `${id}-x${blocks.length}`,
          page: pageIndex,
          label,
          key: normaliseLabel(label),
          text: "\u200b",
          region: { page: pageIndex, rect: extraRect },
          continuation: true,
          confidence: 0.5,
          order: startOrder + i,
        });
      }
    });

    // Sort by vertical position (reading order).
    blocks.sort((a, b) => a.region.rect.y - b.region.rect.y);
    blocks.forEach((b, i) => (b.order = startOrder + i));

    return Response.json({ blocks });
  } catch (err) {
    return fail(err);
  }
}
