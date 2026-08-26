import { NextResponse } from 'next/server';

// Restored helper for API routes
export function resolveKey(req: Request): string | null {
  const clientKey = req.headers.get('x-gemini-key');
  return process.env.GEMINI_API_KEY || clientKey || null;
}

// Restored helper for standardizing errors
export function fail(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status });
}

// Restored helper to safely parse Gemini JSON and strip Markdown
export function parseJson(text: string) {
  try {
    const cleaned = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("JSON Parse Error on:", text);
    return null;
  }
}

// The main API caller with the fixes
export async function callGemini(images: any[], prompt: string, apiKey: string) {
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          ...images 
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json", 
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API Error:", response.status, errorText);
    throw new Error(`Gemini Error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  const parsed = parseJson(text);
  if (!parsed) {
    throw new Error("Gemini did not return valid JSON.");
  }
  
  return parsed;
}
