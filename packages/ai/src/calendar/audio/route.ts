import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { base64Audio } = await req.json();
    if (!base64Audio) {
      return NextResponse.json(
        { error: 'No audio data provided' },
        { status: 400 }
      );
    }

    const { text } = await generateText({
      model: google('gemini-2.0-flash-001'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: "Please convert this audio into correct text, and return only the text, no other text or comments. If you can't understand the audio, or there is no audio, return an empty string.",
            },
            {
              type: 'file',
              data: base64Audio,
              mediaType: 'audio/webm',
            },
          ],
        },
      ],
    });

    return NextResponse.json({ text: text.trim() });
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
