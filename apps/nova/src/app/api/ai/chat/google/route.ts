import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

// Replace this with your actual API key
const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

// Initialize Google Generative AI Client
const genAI = new GoogleGenerativeAI(API_KEY);

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

export async function POST(req: Request) {
  const {
    messages,
    model = 'gemini-pro', // Use the appropriate model (e.g., 'gemini-pro', 'chat-bison-001')
  } = (await req.json()) as {
    messages?: { role: string; content: string }[];
    model?: string;
  };

  try {
    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { message: 'No messages provided.' },
        { status: 400 }
      );
    }

    // Prepare messages for Google API (as text)
    const userMessage = messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    // Get the model
    const aiModel = genAI.getGenerativeModel({ model });

    // Send the prompt to the Google API
    const result = await aiModel.generateContent(userMessage);
    const response = result.response;

    return NextResponse.json({ response: response.text() }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        message: `API Failure\nCould not complete the request.\n\n${error?.stack}`,
      },
      { status: 500 }
    );
  }
}
