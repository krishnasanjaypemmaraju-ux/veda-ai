/**
 * Gemini API helper — verified against live Google docs August 2026.
 *
 * Stable models (confirmed):
 *   gemini-3.7-flash  — thinking: low/medium/high only (NOT minimal, NOT 0)
 *   gemini-3.6-flash  — no thinking, JSON mode works perfectly
 *   gemini-3.5-flash  — no thinking, JSON mode works perfectly
 *   gemini-3.5-flash-lite — no thinking
 *   gemini-3.1-flash-lite — no thinking
 *
 * Key rules for Gemini 3.x:
 *   ❌ DO NOT send temperature / top_p / top_k (deprecated, causes 400)
 *   ❌ thinkingBudget:0 on 3.7-flash errors ("minimal not supported")
 *   ✅ thinkingBudget:512 = lowest safe non-zero budget for 3.7-flash
 *   ✅ responseMimeType:"application/json" works on all stable models
 *   ✅ system_instruction works on all stable models
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const PRIMARY = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// Ordered fallback list — all confirmed stable as of Aug 2026.
// 3.7-flash is LAST because it has thinking mode which needs special handling.
const FALLBACKS = Array.from(new Set([
  PRIMARY,
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.7-flash",   // last — thinking model, handled below
]));

// Models with thinking capability.
// thinkingBudget:0 is NOT allowed for these (causes error "minimal not supported").
// We use thinkingBudget:512 which is the lowest safe non-zero value.
// Thought parts are then filtered from the response to get clean JSON.
const THINKING_MODELS = new Set(["gemini-3.7-flash"]);

export type Part =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export function imagePart(dataUrl: string): Part {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error("Invalid base64 image data URL.");
  return { inline_data: { mime_type: m[1], data: m[2] } };
}

export function resolveKey(req: Request): string {
  const supplied = req.headers.get("x-gemini-key");
  const key = (supplied && supplied.trim()) || process.env.GEMINI_API_KEY;
  if (!key) throw new Error(
    "No Gemini API key. Add GEMINI_API_KEY in Vercel environment variables."
  );
  return key;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function callGemini(opts: {
  apiKey: string;
  system: string;
  parts: Part[];
  maxOutputTokens?: number;
}): Promise<string> {
  let lastError = "All Gemini models failed. Check your API key.";

  for (const model of FALLBACKS) {
    const generationConfig: Record<string, unknown> = {
      responseMimeType: "application/json",
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
      // NEVER send temperature/top_p/top_k — deprecated for all Gemini 3.x,
      // sending them causes an immediate 400 error.
    };

    if (THINKING_MODELS.has(model)) {
      // thinkingBudget:0 is NOT allowed — docs say "minimal is not supported".
      // thinkingBudget:512 is the lowest safe non-zero value.
      // We then filter thought parts from the response below.
      generationConfig.thinkingConfig = { thinkingBudget: 512 };
    }

    const reqBody = JSON.stringify({
      system_instruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: opts.parts }],
      generationConfig,
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      let resp: Response;
      try {
        resp = await fetch(
          `${BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: reqBody,
            cache: "no-store",
            // Fail fast 45s — well before Vercel's 60s timeout.
            signal: AbortSignal.timeout(45_000),
          }
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastError = `Network/timeout error calling Gemini (${model}): ${msg}`;
        await sleep(1000 * (attempt + 1));
        continue;
      }

      if (resp.ok) {
        const json = await resp.json();
        const parts: { text?: string; thought?: boolean }[] =
          json?.candidates?.[0]?.content?.parts ?? [];

        // Filter thought parts — thinking models prefix internal reasoning
        // before the actual JSON output. We need only the non-thought parts.
        const filtered = parts
          .filter(p => !p.thought && typeof p.text === "string")
          .map(p => p.text ?? "")
          .join("");

        if (filtered.trim()) return filtered;

        // Fallback: join all parts (for non-thinking models or older format).
        const all = parts.map(p => p.text ?? "").join("");
        if (all.trim()) return all;

        const reason = json?.candidates?.[0]?.finishReason ?? "unknown";
        lastError = `Gemini returned empty output (finishReason: ${reason}, model: ${model}).`;
        break; // try next model
      }

      const raw = await resp.text();
      const detail = raw.replace(/\s+/g, " ").slice(0, 600);

      if (resp.status === 401 || resp.status === 403) {
        // Auth errors — no point trying other models with the same key.
        throw new Error(
          "Gemini rejected the API key (401/403). " +
          "Make sure the key is valid and the Gemini API is enabled at aistudio.google.com."
        );
      }

      if (resp.status === 404) {
        lastError = `Gemini 404: model "${model}" not found. Trying next model.`;
        break; // try next model
      }

      if (resp.status === 400) {
        lastError = `Gemini 400 (${model}): ${detail}`;
        break; // bad request for this model — try next
      }

      if (resp.status === 429) {
        lastError = `Gemini 429: rate limit hit. Retrying…`;
        await sleep(2000 * (attempt + 1));
        continue; // retry same model
      }

      if (resp.status >= 500) {
        lastError = `Gemini ${resp.status} server error. Retrying…`;
        await sleep(1500 * (attempt + 1));
        continue; // retry same model
      }

      lastError = `Gemini ${resp.status}: ${detail}`;
      break;
    }
  }

  throw new Error(lastError);
}

/**
 * Parse JSON from Gemini response, tolerating markdown fences
 * and trailing content the model sometimes adds.
 */
export function parseJson<T>(text: string): T {
  const clean = text.replace(/```(?:json)?/gi, "").trim();

  try { return JSON.parse(clean) as T; } catch { /* try recovery */ }

  const start = clean.search(/[[{]/);
  if (start >= 0) {
    for (let end = clean.length; end > start; end--) {
      const slice = clean.slice(start, end);
      const last = slice[slice.length - 1];
      if (last !== "}" && last !== "]") continue;
      try { return JSON.parse(slice) as T; } catch { /* keep trying */ }
    }
  }

  throw new Error(
    `Could not parse Gemini JSON. First 300 chars: ${text.slice(0, 300)}`
  );
}

/**
 * Always returns a JSON body with { error } so the client can read it.
 */
export function fail(err: unknown) {
  const msg = err instanceof Error ? err.message : "Unexpected server error.";
  let status = 502;
  if (/no gemini api key/i.test(msg)) status = 400;
  else if (/rejected the api key|401|403/i.test(msg)) status = 401;
  else if (/rate limit|429/i.test(msg)) status = 429;
  return Response.json({ error: msg }, { status });
}
