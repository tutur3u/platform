<<<<<<<< HEAD:packages/ai/src/chat/google-vertex/new/route.ts
import { vertex } from '@ai-sdk/google-vertex/edge';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Message, generateText } from 'ai';
import { NextResponse } from 'next/server';

const DEFAULT_MODEL_NAME = 'gemini-1.5-flash-002';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

const HUMAN_PROMPT = '\n\nHuman:';
const AI_PROMPT = '\n\nAssistant:';

const vertexModel = vertex(DEFAULT_MODEL_NAME, {
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
      model: vertexModel,
      prompt,
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
      {
        message: `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${error?.stack}`,
      },
      {
        status: 500,
      }
    );
  }
}

const normalize = (message: Message) => {
  const { content, role } = message;
  if (role === 'user') return `${HUMAN_PROMPT} ${content}`;
  if (role === 'assistant') return `${AI_PROMPT} ${content}`;
  return content;
========
import { createPOST } from '@tuturuuu/ai/chat/google/new/route';

export const config = {
  maxDuration: 90,
  preferredRegion: 'sin1',
  runtime: 'edge',
>>>>>>>> upstream/main:apps/rewise/src/app/api/ai/chat/google/new/route.ts
};

const POST = createPOST({
  serverAPIKeyFallback: true,
});

<<<<<<<< HEAD:packages/ai/src/chat/google-vertex/new/route.ts
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
========
export { POST };
>>>>>>>> upstream/main:apps/rewise/src/app/api/ai/chat/google/new/route.ts
