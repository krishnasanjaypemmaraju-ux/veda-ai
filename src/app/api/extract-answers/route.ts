import { callGemini, fail, imagePart, parseJson, resolveKey } from "@/lib/gemini";
import { boxToRect, normaliseLabel } from "@/lib/mapping";
import type { AnswerBlock } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You read one page of a student's handwritten answer booklet and split it into answer blocks.

An answer block is one continuous stretch of writing that belongs to a single question: the number the student wrote, plus everything under it until the next question number or the end of the page.

Rules:
1. Work top to bottom. For a two-column page, finish the left column before the right.
2. label is the question number the student actually wrote next to that block, copied as written ("11(a)", "Q.3", "5 b"). If the student wrote no number for a block, label must be null. Never guess a label from the content, and never invent a number that is merely plausible.
3. continuation is true when a block carries on from earlier writing rather than starting fresh: it has no label, begins mid-sentence, or is marked "contd", "cont.", "P.T.O." and similar.
4. text is a faithful transcription of the handwriting. Keep formulas, units and working. Write [illegible] where you cannot read it. Do not correct the student's mistakes.
5. box_2d is [ymin, xmin, ymax, xmax] normalised to 0-1000 and must tightly enclose the whole block, including any diagram, rough working and the student's question number. Be precise: this box is drawn on the page for a teacher.
6. If one answer clearly has a separate diagram or table set apart from its text, give that block extra_boxes so the whole answer is covered.
7. Ignore printed page furniture: margins, ruled lines, page numbers, the booklet's own header and roll-number boxes.
8. confidence is 0 to 1, for how sure you are of the label and the boundaries.
9. If the page is blank, return an empty list.

Return only JSON:
{"blocks":[{"label":"11(a)","text":"...","box_2d":[0,0,0,0],"extra_boxes":[[0,0,0,0]],"continuation":false,"confidence":0.9}]}`;

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
      ? `For reference, the paper contains these question numbers: ${questionNumbers.join(", ")}. Use this only to read an ambiguous handwritten number correctly. If the student wrote no number, label stays null.`
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
      if (!body) return; // Skip blocks with no transcribed text
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

      // extra_boxes: these are additional spatial regions for the SAME answer
      // (e.g. a diagram set apart from the text). They are attached to the
      // parent block's region list at the mapping/highlighting stage, NOT
      // stored as separate AnswerBlock entries with empty text, because
      // empty-text blocks appear as ghost click targets in the UI.
      // Instead we store them as synthetic blocks with the parent's text
      // so the highlight overlay works but empty-text ghosts do not appear.
      for (const extra of b.extra_boxes ?? []) {
        const extraRect = boxToRect(extra);
        if (!extraRect) continue;
        blocks.push({
          id: `${id}-x${blocks.length}`,
          page: pageIndex,
          label,
          key: normaliseLabel(label),
          // Use a marker text so the block has a truthy text value
          // (prevents it from being shown as an interactive idle region)
          // but we still suppress it from transcription display by using
          // a consistent sentinel the UI can detect.
          text: "\u200b", // zero-width space — truthy but renders blank
          region: { page: pageIndex, rect: extraRect },
          continuation: true,
          confidence: 0.5,
          order: startOrder + i,
        });
      }
    });

    // Reading order beats whatever order the model happened to emit.
    blocks.sort((a, b) => a.region.rect.y - b.region.rect.y);
    blocks.forEach((b, i) => (b.order = startOrder + i));

    return Response.json({ blocks });
  } catch (err) {
    return fail(err);
  }
}
