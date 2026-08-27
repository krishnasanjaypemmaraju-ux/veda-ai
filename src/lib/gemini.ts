const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Default to gemini-3.6-flash (stable GA, no thinking mode, JSON mode works reliably).
const PRIMARY = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// Fallback chain — tried in order until one succeeds.
const FALLBACKS = Array.from(
  new Set([
    PRIMARY,
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    // 3.7-flash last: has thinking mode — we disable it explicitly below.
    "gemini-3.7-flash",
  ]),
);

// These models default to "thinking" mode. When thinking is on,
// responseMimeType JSON mode fails. We disable it explicitly.
const THINKING_MODELS = new Set(["gemini-3.7-flash"]);

export type Part =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export function imagePart(dataUrl: string): Part {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Page image was not a valid base64 data URL.");
  return { inline_data: { mime_type: match[1], data: match[2] } };
}

export function resolveKey(req: Request): string {
  const supplied = req.headers.get("x-gemini-key");
  const key = (supplied && supplied.trim()) || process.env.GEMINI_API_KEY;
  if (!key)
    throw new Error(
      "No Gemini API key. Set GEMINI_API_KEY in Vercel environment variables, or paste your key into the app.",
    );
  return key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callGemini(opts: {
  apiKey: string;
  system: string;
  parts: Part[];
  maxOutputTokens?: number;
}): Promise<string> {
  let lastError = "All Gemini models failed.";

  for (const model of FALLBACKS) {
    const generationConfig: Record<string, unknown> = {
      responseMimeType: "application/json",
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
      // DO NOT send temperature/top_p/top_k — deprecated for Gemini 3.x and causes 400.
    };

    // Disable thinking so JSON mode works.
    if (THINKING_MODELS.has(model)) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const body = JSON.stringify({
      system_instruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: opts.parts }],
      generationConfig,
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(
          `${BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            cache: "no-store",
            signal: AbortSignal.timeout(45_000), // fail fast before Vercel's 60s wall
          },
        );
      } catch (e) {
        lastError = `Network error: ${e instanceof Error ? e.message : e}`;
        await sleep(800 * (attempt + 1));
        continue;
      }

      if (response.ok) {
        const json = await response.json();
        const parts: { text?: string; thought?: boolean }[] =
          json?.candidates?.[0]?.content?.parts ?? [];

        // Filter out thought parts (thinking models prefix their reasoning here).
        const text = parts
          .filter((p) => !p.thought && typeof p.text === "string")
          .map((p) => p.text ?? "")
          .join("");

        if (text.trim()) return text;

        // Fallback: include all parts (older API format).
        const raw = parts.map((p) => p.text ?? "").join("");
        if (raw.trim()) return raw;

        lastError = `Gemini returned empty response (finishReason: ${json?.candidates?.[0]?.finishReason ?? "unknown"}) for model ${model}.`;
        break;
      }

      const body2 = await response.text();
      const compact = body2.replace(/\s+/g, " ").slice(0, 500);

      if (response.status === 404) { lastError = `Gemini 404: model ${model} not available.`; break; }
      if (response.status === 400) { lastError = `Gemini 400 (${model}): ${compact}`; break; }
      if (response.status === 401 || response.status === 403) {
        throw new Error("Gemini rejected the API key. Check that it is valid and the Gemini API is enabled.");
      }
      if (response.status === 429 || response.status >= 500) {
        lastError = `Gemini ${response.status}: ${compact}`;
        await sleep(1200 * (attempt + 1));
        continue;
      }
      lastError = `Gemini ${response.status}: ${compact}`;
      break;
    }
  }

  throw new Error(lastError);
}

export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try { return JSON.parse(cleaned) as T; } catch { /* continue */ }
  const start = cleaned.search(/[[{]/);
  if (start >= 0) {
    for (let end = cleaned.length; end > start; end--) {
      const slice = cleaned.slice(start, end);
      const last = slice[slice.length - 1];
      if (last !== "}" && last !== "]") continue;
      try { return JSON.parse(slice) as T; } catch { /* keep looking */ }
    }
  }
  throw new Error(`Could not parse JSON from Gemini response. Starts with: ${text.slice(0, 200)}`);
}

export function fail(err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong.";
  let status = 502;
  if (/no gemini api key/i.test(message)) status = 400;
  else if (/rejected the api key/i.test(message)) status = 401;
  else if (/quota|rate limit/i.test(message)) status = 429;
  return Response.json({ error: message }, { status });
}
