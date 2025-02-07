import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/generative-ai';
import { createClient } from '@repo/supabase/next/server';
import { Message } from 'ai';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

const HUMAN_PROMPT = '\n\nHuman:';
const AI_PROMPT = '\n\nAssistant:';

const DEFAULT_MODEL_NAME = 'gemini-2.0-flash-001';

// eslint-disable-next-line no-undef
const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';

const genAI = new GoogleGenerativeAI(API_KEY);

export async function POST(req: Request) {
  try {
    const { model, message, previewToken } = (await req.json()) as {
      model?: string;
      message?: string;
      previewToken?: string;
    };

    if (!message)
      return NextResponse.json('No message provided', { status: 400 });

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json('Unauthorized', { status: 401 });

    // eslint-disable-next-line no-undef
    const apiKey = previewToken || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) return new Response('Missing API key', { status: 400 });

    if (!model) return NextResponse.json('No model provided', { status: 400 });

    const prompt = buildPrompt([
      {
        id: 'initial-message',
        content: `"${message}"`,
        role: 'user',
      },
    ]);

    const geminiRes = await genAI
      .getGenerativeModel({
        model: DEFAULT_MODEL_NAME,
        generationConfig,
        safetySettings,
      })
      .generateContent(prompt);

    const title = geminiRes.response.candidates?.[0]?.content.parts[0]?.text;

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
      model: model.toLowerCase(),
    });

    if (error) return NextResponse.json(error.message, { status: 500 });
    return NextResponse.json({ id, title }, { status: 200 });
  } catch (error: any) {
    console.log(error);
    return NextResponse.json(
      {
        message: `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${error?.stack}`,
      },
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

const generationConfig = undefined;

// const generationConfig = {
//   temperature: 0.9,
//   topK: 1,
//   topP: 1,
//   maxOutputTokens: 2048,
// };

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

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
