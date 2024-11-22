import { appConfig } from '@/constants/configs';
import { AIPrompt } from '@/types/db';
import { createClient } from '@/utils/supabase/server';
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/generative-ai';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

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

const genAI = new GoogleGenerativeAI(appConfig.google.apiKey);

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

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;
  const data: AIPrompt = await req.json();

  if (!data) {
    return NextResponse.json({ message: 'No data provided' }, { status: 400 });
  }

  if (!data.input) {
    return NextResponse.json({ message: 'No input provided' }, { status: 400 });
  }

  const geminiRes = await genAI
    .getGenerativeModel({
      model: appConfig.defaultModel,
      generationConfig,
      safetySettings,
    })
    .generateContent(data?.input);

  const completion = geminiRes.response.candidates?.[0]?.content.parts[0]?.text;
  if (!completion)
    return new Response('Internal Server Error', { status: 500 });

  const { data: prompt, error } = await supabase
    .from('workspace_ai_prompts')
    .insert({
      ...data,
      output: completion,
      ws_id: wsId,
      model: appConfig.defaultModel.toLowerCase(),
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
