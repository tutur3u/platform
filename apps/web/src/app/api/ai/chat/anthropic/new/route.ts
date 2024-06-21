import { createClient } from '@/utils/supabase/server';
import Anthropic, { AI_PROMPT, HUMAN_PROMPT } from '@anthropic-ai/sdk';
import { Message } from 'ai';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

export async function POST(req: Request) {
  try {
    const { message, previewToken } = await req.json();

    if (!message)
      return NextResponse.json('No message provided', { status: 400 });

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json('Unauthorized', { status: 401 });

    const apiKey = previewToken || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return new Response('Missing API key', { status: 400 });

    const prompt = buildPrompt([
      {
        id: 'initial-message',
        content: `"${message}"`,
        role: 'user',
      },
    ]);

    const model = 'claude-instant-1';

    const res = await fetch('https://api.anthropic.com/v1/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        prompt,
        max_tokens_to_sample: 300,
        model,
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          message: 'Internal server error.',
        },
        { status: 500 }
      );
    }

    const data = await res.json();
    const title = data.completion;

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
      model: 'CLAUDE-2.1',
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
  return normalizedMsgs + Anthropic.AI_PROMPT;
}
