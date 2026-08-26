const BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

// Use the model configured in Vercel.
// If nothing is configured, use Gemini 3.6 Flash (stable GA as of July 2026).
const PRIMARY =
  process.env.GEMINI_MODEL || "gemini-3.6-flash";

// Ordered fallback list. Only stable GA models that support vision +
// system_instruction + responseMimeType (JSON mode).
// NOTE: gemini-3.7-flash is intentionally NOT the primary because it has
// thinking enabled by default (thinking_level: "medium"), and when thinking
// is active Gemini returns thought parts before the JSON part. We add it
// at the end so it's tried last with thinking explicitly disabled.
const FALLBACKS = Array.from(
  new Set([
    PRIMARY,
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    // 3.7 flash last — we disable thinking explicitly below.
    "gemini-3.7-flash",
  ]),
);

// Models that default to thinking mode and need it explicitly disabled
// so that responseMimeType (JSON mode) works correctly.
const THINKING_MODELS = new Set([
  "gemini-3.7-flash",
]);

export type Part =
  | {
      text: string;
    }
  | {
      inline_data: {
        mime_type: string;
        data: string;
      };
    };

export function imagePart(dataUrl: string): Part {
  const match =
    /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);

  if (!match) {
    throw new Error(
      "Page image was not a base64 data URL.",
    );
  }

  return {
    inline_data: {
      mime_type: match[1],
      data: match[2],
    },
  };
}

export function resolveKey(req: Request): string {
  // First check for a key explicitly supplied by the app.
  const supplied = req.headers.get("x-gemini-key");

  // Otherwise use the Vercel environment variable.
  const key =
    (supplied && supplied.trim()) ||
    process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error(
      "No Gemini API key available. Set GEMINI_API_KEY in Vercel, or paste a Gemini key into the app.",
    );
  }

  return key;
}

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function explainGeminiError(
  status: number,
  detail: string,
  model: string,
): string {
  const compact = detail
    .replace(/\s+/g, " ")
    .slice(0, 700);

  if (status === 400) {
    return (
      `Gemini 400 – request rejected for ${model}. ` +
      compact
    );
  }

  if (status === 401 || status === 403) {
    return (
      "Gemini rejected the API key. " +
      "Check that the key is valid and that the Gemini API is enabled."
    );
  }

  if (status === 404) {
    return (
      `Gemini 404 – model ${model} is unavailable for this API key. ` +
      "Trying next model."
    );
  }

  if (status === 429) {
    return (
      "Gemini 429 – rate limit or quota reached. " +
      "Wait a moment and try again."
    );
  }

  if (status >= 500) {
    return (
      `Gemini ${status} – service error. ` +
      "Please try again."
    );
  }

  return `Gemini ${status}: ${compact}`;
}

export async function callGemini(opts: {
  apiKey: string;
  system: string;
  parts: Part[];
  maxOutputTokens?: number;
}): Promise<string> {
  /*
   * IMPORTANT — Gemini 3.x API notes (as of August 2026):
   *
   * 1. DO NOT send temperature / top_p / top_k.
   *    These sampling parameters are DEPRECATED for all Gemini 3.x models
   *    and sending them causes a 400 error.
   *
   * 2. responseMimeType: "application/json" (JSON mode) is incompatible
   *    with thinking-enabled models when thinking_level is medium or high.
   *    Thought parts appear before the JSON in the response, corrupting it.
   *    We must either:
   *      a) Disable thinking with thinking_level: "none", or
   *      b) Avoid using JSON mode with thinking models.
   *    We choose (a) for models in THINKING_MODELS so JSON mode is preserved.
   *
   * 3. Thinking model responses include "thought" parts in content.parts.
   *    We must filter to only parts that are NOT thought-only parts
   *    (identified by having thought: true or no text containing our JSON).
   */

  let lastError = "";

  for (const model of FALLBACKS) {
    // For thinking-capable models, explicitly disable thinking so that
    // JSON mode (responseMimeType) works correctly.
    const needsThinkingDisabled = THINKING_MODELS.has(model);

    const generationConfig: Record<string, unknown> = {
      responseMimeType: "application/json",
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
    };

    if (needsThinkingDisabled) {
      // "none" disables thinking for models that support it,
      // making JSON mode work reliably.
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const body = JSON.stringify({
      system_instruction: {
        parts: [{ text: opts.system }],
      },
      contents: [
        {
          role: "user",
          parts: opts.parts,
        },
      ],
      generationConfig,
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;

      try {
        response = await fetch(
          `${BASE}/${encodeURIComponent(
            model,
          )}:generateContent?key=${encodeURIComponent(
            opts.apiKey,
          )}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body,
            cache: "no-store",
          },
        );
      } catch (error) {
        lastError =
          `Network error reaching Gemini: ${
            error instanceof Error
              ? error.message
              : "Unknown network error"
          }`;
        await sleep(800 * (attempt + 1));
        continue;
      }

      /*
       * Successful Gemini response
       */
      if (response.ok) {
        const json = await response.json();

        const parts: { text?: string; thought?: boolean }[] =
          json?.candidates?.[0]?.content?.parts ?? [];

        // Filter out thought-only parts (identified by thought: true).
        // Thought parts are internal reasoning and must not be included
        // in the JSON output we try to parse.
        const textParts = parts.filter(
          (p) => !p.thought && typeof p.text === "string",
        );

        const text = textParts
          .map((p) => p.text ?? "")
          .join("");

        if (text.trim()) {
          return text;
        }

        // If filtering removed everything, try unfiltered (older format
        // where thoughts are in a separate candidate field).
        const rawText = parts
          .map((p) => p.text ?? "")
          .join("");

        if (rawText.trim()) {
          return rawText;
        }

        const finishReason =
          json?.candidates?.[0]?.finishReason ??
          "empty response";

        lastError =
          `Gemini returned no text (finishReason: ${finishReason}) for model ${model}.`;

        break; // Try next model
      }

      /*
       * Gemini returned an HTTP error.
       */
      const rawBody = await response.text();
      lastError = explainGeminiError(
        response.status,
        rawBody,
        model,
      );

      // Model doesn't exist / isn't available → next model.
      if (response.status === 404) {
        break;
      }

      // Request format isn't accepted → next model.
      if (response.status === 400) {
        break;
      }

      // Temporary quota/server issue → retry.
      if (
        response.status === 429 ||
        response.status >= 500
      ) {
        await sleep(1200 * (attempt + 1));
        continue;
      }

      // Auth errors must not be retried.
      throw new Error(lastError);
    }
  }

  throw new Error(
    lastError ||
      "All Gemini models failed. Check the API key and model configuration.",
  );
}

/**
 * Gemini is instructed to return JSON.
 *
 * Sometimes models still wrap JSON inside markdown
 * or add a short sentence. This function attempts to
 * recover the JSON safely.
 */
export function parseJson<T>(text: string): T {
  const cleaned = text
    .replace(/```(?:json)?/gi, "")
    .trim();

  // First try the complete response.
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Continue to recovery.
  }

  // Find the beginning of a JSON object/array.
  const start = cleaned.search(/[[{]/);

  if (start >= 0) {
    // Try progressively shorter endings until valid JSON is found.
    for (
      let end = cleaned.length;
      end > start;
      end--
    ) {
      const slice = cleaned.slice(start, end);
      const last = slice[slice.length - 1];
      if (last !== "}" && last !== "]") continue;
      try {
        return JSON.parse(slice) as T;
      } catch {
        // Keep looking.
      }
    }
  }

  throw new Error(
    `Could not read JSON from the Gemini response. Raw text starts: ${text.slice(0, 200)}`,
  );
}

/**
 * Converts backend errors into useful HTTP responses.
 * Always returns a JSON body with an "error" key so the
 * client-side fetch can read it reliably.
 */
export function fail(err: unknown) {
  const message =
    err instanceof Error
      ? err.message
      : "Something went wrong.";

  let status = 502;

  if (/no gemini api key/i.test(message)) {
    status = 400;
  } else if (
    /rejected the api key/i.test(message)
  ) {
    status = 401;
  } else if (
    /quota|rate limit/i.test(message)
  ) {
    status = 429;
  }

  return Response.json(
    { error: message },
    { status },
  );
}
