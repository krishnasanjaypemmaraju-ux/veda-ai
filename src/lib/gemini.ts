const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Stable production default.
// Can be overridden in Vercel with GEMINI_MODEL.
const PRIMARY = process.env.GEMINI_MODEL || "gemini-3.6-flash";

const FALLBACKS = Array.from(
  new Set([
    PRIMARY,
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ]),
);

export type Part =
  | { text: string }
  | {
      inline_data: {
        mime_type: string;
        data: string;
      };
    };

export function imagePart(dataUrl: string): Part {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);

  if (!match) {
    throw new Error("Page image was not a base64 data URL.");
  }

  return {
    inline_data: {
      mime_type: match[1],
      data: match[2],
    },
  };
}

export function resolveKey(req: Request): string {
  const supplied = req.headers.get("x-gemini-key");

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
  const compact = detail.replace(/\s+/g, " ").slice(0, 500);

  if (status === 400) {
    return `Gemini rejected the request for ${model}. ${compact}`;
  }

  if (status === 401 || status === 403) {
    return "Gemini rejected the API key. Check that the key is valid and Gemini API access is enabled.";
  }

  if (status === 404) {
    return `Gemini model ${model} is unavailable for this API key.`;
  }

  if (status === 429) {
    return "Gemini rate limit or quota reached. Wait a moment and try again.";
  }

  if (status >= 500) {
    return `Gemini service error (${status}). Please try again.`;
  }

  return `Gemini ${status}: ${compact}`;
}

export async function callGemini(opts: {
  apiKey: string;
  system: string;
  parts: Part[];
  maxOutputTokens?: number;
}): Promise<string> {
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

    generationConfig: {
      temperature: 0,
      topP: 0.9,
      responseMimeType: "application/json",
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
    },
  });

  let lastError = "";

  for (const model of FALLBACKS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;

      try {
        response = await fetch(
          `${BASE}/${encodeURIComponent(
            model,
          )}:generateContent?key=${encodeURIComponent(opts.apiKey)}`,
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

      if (response.ok) {
        const json = await response.json();

        const parts =
          json?.candidates?.[0]?.content?.parts ?? [];

        const text = parts
          .map((part: { text?: string }) => part.text ?? "")
          .join("");

        if (text.trim()) {
          return text;
        }

        const finishReason =
          json?.candidates?.[0]?.finishReason ??
          "empty response";

        lastError =
          `Gemini returned no text (${finishReason}).`;

        break;
      }

      const detail = await response.text();

      lastError = explainGeminiError(
        response.status,
        detail,
        model,
      );

      // Try another model if this model is unavailable.
      if (response.status === 404) {
        break;
      }

      // Some request formats can be model-specific.
      if (response.status === 400) {
        break;
      }

      // Retry temporary failures.
      if (
        response.status === 429 ||
        response.status >= 500
      ) {
        await sleep(1200 * (attempt + 1));
        continue;
      }

      // Authentication failures should not be retried.
      throw new Error(lastError);
    }
  }

  throw new Error(
    lastError ||
      "Gemini call failed. Check the API key and model configuration.",
  );
}

/**
 * Gemini normally returns clean JSON because responseMimeType
 * is set to application/json.
 *
 * This fallback also handles responses wrapped in markdown fences
 * or short explanatory text.
 */
export function parseJson<T>(text: string): T {
  const cleaned = text
    .replace(/```(?:json)?/gi, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to recover JSON from surrounding text.
  }

  const start = cleaned.search(/[[{]/);

  if (start >= 0) {
    for (
      let end = cleaned.length;
      end > start;
      end--
    ) {
      const slice = cleaned.slice(start, end);
      const last = slice[slice.length - 1];

      if (last !== "}" && last !== "]") {
        continue;
      }

      try {
        return JSON.parse(slice) as T;
      } catch {
        // Continue shrinking the candidate.
      }
    }
  }

  throw new Error(
    "Could not read JSON from the Gemini response.",
  );
}

export function fail(err: unknown) {
  const message =
    err instanceof Error
      ? err.message
      : "Something went wrong.";

  let status = 502;

  if (/no gemini api key/i.test(message)) {
    status = 400;
  } else if (/rejected the api key/i.test(message)) {
    status = 401;
  } else if (/quota|rate limit/i.test(message)) {
    status = 429;
  }

  return Response.json(
    {
      error: message,
    },
    {
      status,
    },
  );
}
