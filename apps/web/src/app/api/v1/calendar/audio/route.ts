import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { base64Audio } = await req.json();
    if (!base64Audio) {
      return NextResponse.json({ error: "No audio data provided" }, { status: 400 });
    }

    // Gọi API Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: "Please convert this audio into correct text:" },
                {
                  inline_data: {
                    mime_type: "audio/webm",
                    data: base64Audio,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    const result = await response.json();

    if (!result || !result.candidates) {
      return NextResponse.json({ error: "Invalid response from Gemini" }, { status: 500 });
    }

    const text = result.candidates[0]?.content?.parts?.[0]?.text || "";

    return NextResponse.json({ text });
  } catch (error) {
    console.error("❌ Error calling Gemini API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
