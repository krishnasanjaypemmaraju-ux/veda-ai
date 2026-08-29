import { fail, resolveKey } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM = `You are VedaAI, a warm and experienced school/college teacher's AI assistant.
Help teachers understand student performance, suggest improvements, and give actionable study tips.

Rules:
1. Be warm, encouraging, and professional — like a mentor, not a machine.
2. When given exam results, reference specific questions, scores, and feedback.
3. Give concrete, practical improvement suggestions — not vague generic advice.
4. Keep answers concise: 2-4 short paragraphs. Use bullet points when listing things.
5. If asked to compare with previous sessions, mention trends (improving, declining, consistent).
6. Always end with ONE specific actionable tip the teacher can share with the student.
7. Never invent scores or details not in the context. Reply in plain text, no markdown headers.`;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function chatWithGemini(apiKey: string, message: string, context: string): Promise<string> {
  const prompt = context
    ? `EXAM CONTEXT:\n${context}\n\nTEACHER'S QUESTION:\n${message}`
    : message;

  // Chat uses plain text — no responseMimeType to avoid JSON mode restriction
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 1024,
      // No responseMimeType — plain text output for chat
    },
  });

  const models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let resp: Response;
      try {
        resp = await fetch(
          `${BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            cache: "no-store",
            signal: AbortSignal.timeout(45_000),
          }
        );
      } catch (e) {
        await sleep(1000 * (attempt + 1));
        continue;
      }

      if (resp.ok) {
        const json = await resp.json();
        const parts: { text?: string; thought?: boolean }[] =
          json?.candidates?.[0]?.content?.parts ?? [];
        const text = parts
          .filter(p => !p.thought && typeof p.text === "string")
          .map(p => p.text ?? "")
          .join("")
          .trim();
        if (text) return text;
        break;
      }

      const status = resp.status;
      if (status === 401 || status === 403) {
        throw new Error("Gemini rejected the API key. Check that it is valid.");
      }
      if (status === 404 || status === 400) break; // try next model
      if (status === 429 || status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      break;
    }
  }

  throw new Error("Could not get a response from Gemini. Please try again.");
}

export async function POST(req: Request) {
  try {
    const apiKey = resolveKey(req);
    const { message, context } = await req.json() as { message: string; context: string };

    if (!message?.trim()) {
      return Response.json({ error: "Message is required." }, { status: 400 });
    }

    const reply = await chatWithGemini(apiKey, message.trim(), context ?? "");
    return Response.json({ reply });
  } catch (err) {
    return fail(err);
  }
}
