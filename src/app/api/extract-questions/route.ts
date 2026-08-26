import { NextResponse } from 'next/server';
import { callGemini } from '@/lib/gemini';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { images, prompt } = body;

    const clientKey = req.headers.get('x-gemini-key');
    const apiKey = process.env.GEMINI_API_KEY || clientKey;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing Gemini API Key." }, { status: 401 });
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: "No images provided." }, { status: 400 });
    }

    const defaultPrompt = `
      Analyze this question paper page. Extract every question.
      Preserve the original numbering and treat subparts (e.g., 11(a), 11(b)) as separate questions.
      Return purely a JSON object with this structure:
      {
        "questions": [
          {
            "label": "11(a)",
            "text": "The text of the question",
            "marks": 5,
            "box_2d": [0, 0, 100, 100] 
          }
        ]
      }
      Coordinates must be 0-1000 representing [ymin, xmin, ymax, xmax].
    `;

    const result = await callGemini(images, prompt || defaultPrompt, apiKey);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Extract Questions API Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: error.message?.includes("Gemini Error") ? 502 : 500 }
    );
  }
}
