export async function callGemini(images: any[], prompt: string, apiKey: string) {
  // Uses gemini-3.6-flash by default, or reads from your Vercel environment variables
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

  // Strip markdown formatting before parsing to prevent JSON.parse crashes
  text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();

  try {
    return JSON.parse(text);
  } catch (err) {
    console.error("Failed to parse Gemini output:", text);
    throw new Error("Gemini did not return valid JSON.");
  }
}
