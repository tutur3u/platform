import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { base64Image } = await req.json();
    if (!base64Image) {
      return NextResponse.json(
        { error: 'No image data provided' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: 'Extract all events, times, and locations from the image, arrange them in chronological order. The output should be natural language text for one or many calendar events.',
                },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: base64Image,
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
      return NextResponse.json(
        { error: 'Invalid response from Gemini' },
        { status: 500 }
      );
    }

    const text = result.candidates[0]?.content?.parts?.[0]?.text || '';

    return NextResponse.json({ text });
  } catch (error) {
    console.error('❌ Error calling Gemini API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
