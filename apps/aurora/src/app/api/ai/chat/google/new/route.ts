import { appConfig } from '@/constants/configs';
import { createClient } from '@/utils/supabase/server';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

export async function POST(req: Request) {
  try {
    const {
      model = appConfig.defaultModel,
      message,
      previewToken,
    } = (await req.json()) as {
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

    const apiKey = previewToken || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) return new Response('Missing API key', { status: 400 });

    const result = await generateText({
      model: google(appConfig.defaultModel, {
        safetySettings: [
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_NONE',
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_NONE',
          },
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_NONE',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_NONE',
          },
        ],
      }),
      messages: [
        {
          content: message,
          role: 'user',
        },
      ],
      system:
        'Respond with a short and comprehensive title for this chat conversation with the given first message from the user.',
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
