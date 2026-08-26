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
      return NextResponse.json({ error: "No images provided" }, { status: 400 });
    }

    const defaultPrompt = `
      Analyze this student's handwritten answer sheet. Extract handwritten answers.
      Return purely a JSON object: 
      { 
        "blocks": [
          {
            "label": "11(a)",
            "text": "transcribed answer",
            "box_2d": [0, 0, 100, 100],
            "continuation": false,
            "confidence": 0.95
          }
        ] 
      }
      Coordinates must be 0-1000 representing [ymin, xmin, ymax, xmax].
      If an answer continues from a previous block, set "continuation": true.
    `;

    const result = await callGemini(images, prompt || defaultPrompt, apiKey);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Extract Answers API Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: error.message?.includes("Gemini Error") ? 502 : 500 }
    );
  }
}
