import { AIPrompt } from '@/types/db';
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/generative-ai';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Params {
  params: {
    wsId: string;
  };
}

export async function GET(_: Request, { params: { wsId } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from('workspace_ai_prompts')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('name', { ascending: true });

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching prompts' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

const DEFAULT_MODEL_NAME = 'gemini-1.0-pro-latest';
const API_KEY = process.env.GOOGLE_API_KEY || '';

const genAI = new GoogleGenerativeAI(API_KEY);

const generationConfig = {
  temperature: 0.9,
  topK: 1,
  topP: 1,
  maxOutputTokens: 2048,
};

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

export async function POST(req: Request, { params: { wsId } }: Params) {
  const supabase = createRouteHandlerClient({ cookies });
  const data: AIPrompt = await req.json();

  if (!data) {
    return NextResponse.json({ message: 'No data provided' }, { status: 400 });
  }

  if (!data.input) {
    return NextResponse.json({ message: 'No input provided' }, { status: 400 });
  }

  const geminiRes = await genAI
    .getGenerativeModel({
      model: DEFAULT_MODEL_NAME,
      generationConfig,
      safetySettings,
    })
    .generateContent(data?.input);

  const completion = geminiRes.response.candidates?.[0].content.parts[0].text;
  if (!completion)
    return new Response('Internal Server Error', { status: 500 });

  const { data: prompt, error } = await supabase
    .from('workspace_ai_prompts')
    .insert({
      ...data,
      output: completion,
      ws_id: wsId,
    })
    .select('id')
    .single();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating new prompt' },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: prompt.id, output: completion });
}
