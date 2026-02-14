import { createClient } from '@tuturuuu/supabase/next/server';
import { gateway, generateText, type UIMessage } from 'ai';
import { NextResponse } from 'next/server';

export const maxDuration = 60;
export const preferredRegion = 'sin1';

const HUMAN_PROMPT = '\n\nHuman:';
const AI_PROMPT = '\n\nAssistant:';

const DEFAULT_MODEL_NAME = 'gemini-2.5-flash-lite';

export async function POST(req: Request) {
  try {
    const { model, message } = (await req.json()) as {
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

    if (!model) return NextResponse.json('No model provided', { status: 400 });

    const prompt = buildPrompt([
      {
        id: 'initial-message',
        parts: [{ type: 'text', text: `"${message}"` }],
        role: 'user',
      },
    ]);

    const result = await generateText({
      model: gateway(`google/${DEFAULT_MODEL_NAME}`),
      prompt,
      providerOptions: {
        google: {
          safetySettings: [
            {
              category: 'HARM_CATEGORY_HARASSMENT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_HATE_SPEECH',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
              threshold: 'BLOCK_NONE',
            },
          ],
        },
      },
    });

    const title = result.text;

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
      model: model.toLowerCase(),
    });

    if (error) return NextResponse.json(error.message, { status: 500 });
    return NextResponse.json({ id, title }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        message: `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${(error as Error)?.stack || 'No stack trace available'}`,
      },
      {
        status: 500,
      }
    );
  }
}

const normalize = (message: UIMessage) => {
  const { parts, role } = message;
  // Extract text from parts array
  const content =
    parts?.map((part) => (part.type === 'text' ? part.text : '')).join('') ||
    '';
  if (role === 'user') return `${HUMAN_PROMPT} ${content}`;
  if (role === 'assistant') return `${AI_PROMPT} ${content}`;
  return content;
};

const normalizeMessages = (messages: UIMessage[]) =>
  [...leadingMessages, ...messages, ...trailingMessages]
    .map(normalize)
    .join('')
    .trim();

function buildPrompt(messages: UIMessage[]) {
  const normalizedMsgs = normalizeMessages(messages);
  return normalizedMsgs + AI_PROMPT;
}

const leadingMessages: UIMessage[] = [
  {
    id: 'initial-message',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: 'Please provide an initial message so I can generate a short and comprehensive title for this chat conversation.',
      },
    ],
  },
];

const trailingMessages: UIMessage[] = [
  {
    id: 'final-message',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: 'Thank you, I will respond with a title in my next response that will briefly demonstrate what the chat conversation is about, and it will only contain the title without any quotation marks, markdown, and anything else but the title. The title will be in the language you provided the initial message in.',
      },
    ],
  },
];
