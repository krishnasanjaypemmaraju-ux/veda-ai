const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const PRIMARY = process.env.GEMINI_MODEL || "gemini-3.6-flash";
// If the primary id has been retired on the account, walk down the free tier.
const FALLBACKS = [PRIMARY, "gemini-3.7-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite"];

export type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

export function imagePart(dataUrl: string): Part {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Page image was not a base64 data URL.");
  return { inline_data: { mime_type: match[1], data: match[2] } };
}

export function resolveKey(req: Request): string {
  const supplied = req.headers.get("x-gemini-key");
  const key = (supplied && supplied.trim()) || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "No Gemini key available. Set GEMINI_API_KEY on the server, or paste a key in the app.",
    );
  }
  return key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callGemini(opts: {
  apiKey: string;
  system: string;
  parts: Part[];
  maxOutputTokens?: number;
}): Promise<string> {
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: opts.parts }],
    generationConfig: {
      temperature: 0,
      topP: 0.9,
      responseMimeType: "application/json",
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
    },
  });

  let lastError = "";

  for (const model of FALLBACKS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${BASE}/${model}:generateContent?key=${opts.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch (err) {
        lastError = `Network error reaching Gemini: ${(err as Error).message}`;
        await sleep(800 * (attempt + 1));
        continue;
      }

      if (res.ok) {
        const json = await res.json();
        const parts = json?.candidates?.[0]?.content?.parts ?? [];
        const text = parts.map((p: { text?: string }) => p.text ?? "").join("");
        if (text.trim()) return text;
        const reason = json?.candidates?.[0]?.finishReason ?? "empty response";
        lastError = `Gemini returned no text (${reason}).`;
        break;
      }

      const detail = await res.text();
      lastError = `Gemini ${res.status}: ${detail.slice(0, 300)}`;

      if (res.status === 404 || res.status === 400) break; // wrong model id, try the next one
      if (res.status === 429 || res.status >= 500) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw new Error(lastError); // 401/403 are not worth retrying
    }
  }

  throw new Error(lastError || "Gemini call failed.");
}

/** Models occasionally wrap JSON in prose or fences. Recover instead of failing. */
export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* fall through */
  }
  const start = cleaned.search(/[[{]/);
  if (start >= 0) {
    for (let end = cleaned.length; end > start; end--) {
      const slice = cleaned.slice(start, end);
      const last = slice[slice.length - 1];
      if (last !== "}" && last !== "]") continue;
      try {
        return JSON.parse(slice) as T;
      } catch {
        /* keep shrinking */
      }
    }
  }
  throw new Error("Could not read JSON from the model response.");
}

export function fail(err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong.";
  const status = /no gemini key/i.test(message) ? 400 : 502;
  return Response.json({ error: message }, { status });
}
