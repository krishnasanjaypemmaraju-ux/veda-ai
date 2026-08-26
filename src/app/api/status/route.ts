export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    hasServerKey: Boolean(process.env.GEMINI_API_KEY),
    // Default must match PRIMARY in src/lib/gemini.ts
    model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
  });
}
