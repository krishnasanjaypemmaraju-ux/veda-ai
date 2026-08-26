const BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

// Use the model configured in Vercel.
// If nothing is configured, use Gemini 3.7 Flash.
const PRIMARY =
  process.env.GEMINI_MODEL || "gemini-3.7-flash";

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
      `Gemini rejected the request for ${model}. ` +
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
      `Gemini model ${model} is unavailable for this API key.`
    );
  }

  if (status === 429) {
    return (
      "Gemini rate limit or quota reached. " +
      "Wait a moment and try again."
    );
  }

  if (status >= 500) {
    return (
      `Gemini service error (${status}). ` +
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
   * IMPORTANT:
   *
   * Do NOT add temperature/topP/topK here when using
   * Gemini 3.x models.
   *
   * This was the problem in the previous version.
   */

  const body = JSON.stringify({
    system_instruction: {
      parts: [
        {
          text: opts.system,
        },
      ],
    },

    contents: [
      {
        role: "user",
        parts: opts.parts,
      },
    ],

    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens:
        opts.maxOutputTokens ?? 8192,
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

        const parts =
          json?.candidates?.[0]?.content?.parts ?? [];

        const text = parts
          .map(
            (part: { text?: string }) =>
              part.text ?? "",
          )
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

      /*
       * Gemini returned an HTTP error.
       */
      const detail = await response.text();

      lastError = explainGeminiError(
        response.status,
        detail,
        model,
      );

      /*
       * Model doesn't exist / isn't available.
       * Move to the next model.
       */
      if (response.status === 404) {
        break;
      }

      /*
       * Request format isn't accepted by this model.
       * Try the next model.
       */
      if (response.status === 400) {
        break;
      }

      /*
       * Temporary quota/server issue.
       * Retry.
       */
      if (
        response.status === 429 ||
        response.status >= 500
      ) {
        await sleep(1200 * (attempt + 1));

        continue;
      }

      /*
       * Authentication errors should not be retried.
       */
      throw new Error(lastError);
    }
  }

  throw new Error(
    lastError ||
      "Gemini call failed. Check the API key and model configuration.",
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

  /*
   * First try the complete response.
   */
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Continue to recovery.
  }

  /*
   * Find the beginning of a JSON object/array.
   */
  const start = cleaned.search(/[[{]/);

  if (start >= 0) {
    /*
     * Try progressively shorter endings until valid JSON
     * is found.
     */
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
        // Keep looking.
      }
    }
  }

  throw new Error(
    "Could not read JSON from the Gemini response.",
  );
}

/**
 * Converts backend errors into useful HTTP responses.
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
    {
      error: message,
    },
    {
      status,
    },
  );
}
