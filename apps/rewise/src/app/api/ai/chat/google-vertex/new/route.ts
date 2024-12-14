import { createClient } from '@/utils/supabase/server';
import { createVertex } from '@ai-sdk/google-vertex/edge';
import { AI_PROMPT, HUMAN_PROMPT } from '@anthropic-ai/sdk';
import { Message, generateText } from 'ai';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

const vertex = createVertex({
  project: process.env.GCP_PROJECT_ID || '',
  location: process.env.GCP_LOCATION || 'asia-southeast1',
  googleCredentials: {
    clientEmail: process.env.GCP_SERVICE_ACCOUNT_CLIENT_EMAIL || '',
    privateKey: process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY || '',
  },
});

const DEFAULT_MODEL_NAME = 'gemini-2.0-flash-exp';

const ggVertex = vertex(DEFAULT_MODEL_NAME, {
  safetySettings: [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  ],
});

async function generateChatTitle(message: string) {
  const prompt =
    'Generate a concise title for the following chat conversation: ' + message;

  try {
    const res = await generateText({
      model: ggVertex,
      prompt: prompt,
    });
    return res?.text || null;
  } catch (error) {
    console.log('Error generating chat title:', error);
    throw error;
  }
}

export async function POST(req: Request) {
  try {
    const { model = DEFAULT_MODEL_NAME, message } = (await req.json()) as {
      model?: string;
      message?: string;
    };

    if (!message)
      return NextResponse.json('No message provided', { status: 400 });

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json('Unauthorized', { status: 401 });

    const gcpClientEmail = process.env.GCP_SERVICE_ACCOUNT_CLIENT_EMAIL;
    const gcpPrivateKey = process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY;

    if (!gcpClientEmail) {
      return new Response('Missing GCP Service Account Client Email', {
        status: 400,
      });
    }

    if (!gcpPrivateKey) {
      return new Response('Missing GCP Service Account Private Key', {
        status: 400,
      });
    }

    const prompt = buildPrompt([
      {
        id: 'initial-message',
        content: `"${message}"`,
        role: 'user',
      },
    ]);

    const title = await generateChatTitle(prompt);

    if (!title) {
      return NextResponse.json(
        {
          message: 'Internal server error.',
        },
        { status: 501 }
      );
    }

    const { data: id, error } = await supabase.rpc('create_ai_chat', {
      title,
      message,
      model: model.toLowerCase(),
    });

    if (error) return NextResponse.json(error.message, { status: 503 });
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
      'Thank you, I will respond with a title in my next response that will briefly demonstrate what the chat conversation is about, and it will only contain the title without any quotation marks, markdown, and anything else but the title. The title will be in the language you provided the initial message in.',
  },
];
