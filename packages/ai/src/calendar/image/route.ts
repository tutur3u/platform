import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { base64Image } = await req.json();
    if (!base64Image) {
      return NextResponse.json(
        { error: 'No image data provided' },
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
              text: 'Extract all events, times, and locations from the image, arrange them in chronological order. The output should be natural language text for one or many calendar events.',
            },
            {
              type: 'image',
              image: base64Image,
              mediaType: 'image/jpeg',
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
