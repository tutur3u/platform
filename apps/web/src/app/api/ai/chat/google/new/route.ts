import { AI_PROMPT, HUMAN_PROMPT } from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Message } from 'ai';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';
export const dynamic = 'force-dynamic';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

export async function POST(req: Request) {
  try {
    const { message, previewToken } = await req.json();

    if (!message)
      return NextResponse.json('No message provided', { status: 400 });

    const cookieStore = cookies();
    const supabase = createServerComponentClient({
      cookies: () => cookieStore,
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json('Unauthorized', { status: 401 });

    const apiKey = previewToken || process.env.GOOGLE_API_KEY;
    if (!apiKey) return new Response('Missing API key', { status: 400 });

    const prompt = buildPrompt([
      {
        id: 'initial-message',
        content: `"${message}"`,
        role: 'user',
      },
    ]);

    const model = 'gemini-1.0-pro-latest';

    const geminiRes = await genAI
      .getGenerativeModel({ model })
      .generateContent(prompt);

    const title = geminiRes.response.candidates?.[0].content.parts[0].text;

    if (!title) {
      return NextResponse.json(
        {
          message: 'Internal server error.',
        },
        { status: 500 }
      );
    }

    if (!title) {
      return NextResponse.json(
        {
          message: 'Internal server error.',
        },
        { status: 500 }
      );
    }

    const { data: id, error } = await supabase.rpc('create_ai_chat', {
      title,
      message,
      model: 'GOOGLE-GEMINI-PRO',
    });

    if (error) return NextResponse.json(error.message, { status: 500 });
    return NextResponse.json({ id, title }, { status: 200 });
  } catch (error: any) {
    console.log(error);
    return NextResponse.json(
      `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${error?.stack}`,
      {
        status: 200,
      }
    );
  }
}

const leadingMessages: Message[] = [
  {
    id: 'initial-message',
    role: 'assistant',
    content:
      'Please provide an initial message so I can generate a short and comprehensive title for this chat conversation.',
  },
];

const trailingMessages: Message[] = [
  {
    id: 'final-message',
    role: 'assistant',
    content:
      'Thank you, I will respond with a title in my next response, and it will only contain the title without any quotation marks, and nothing else.',
  },
];

const normalize = (message: Message) => {
  const { content, role } = message;
  if (role === 'user') return `${HUMAN_PROMPT} ${content}`;
  if (role === 'assistant') return `${AI_PROMPT} ${content}`;
  return content;
};

const normalizeMessages = (messages: Message[]) =>
  [...leadingMessages, ...messages, ...trailingMessages]
    .map(normalize)
    .join('')
    .trim();

function buildPrompt(messages: Message[]) {
  const normalizedMsgs = normalizeMessages(messages);
  return normalizedMsgs + AI_PROMPT;
}
