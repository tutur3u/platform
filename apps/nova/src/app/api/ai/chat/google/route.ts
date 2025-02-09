import { AppConfig, appConfig } from '@/constants/configs';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import { google } from '@ai-sdk/google';
import { CoreMessage, streamText } from 'ai';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

export async function POST(req: Request) {
  const sbAdmin = await createAdminClient();
  const {
    id,
    model = appConfig.defaultModel,
    messages,
    previewToken,
    mode,
  } = (await req.json()) as {
    id?: string;
    model?: string;
    messages?: CoreMessage[];
    previewToken?: string;
    mode?: 'short' | 'medium' | 'long';
  };

  try {
    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { message: 'No messages provided.' },
        { status: 400 }
      );
    }

    // Stream AI response
    const aiResponse = await streamText({
      model: google(model),
      messages,
      mode,
    });

    // Optionally, save the conversation to Supabase if needed
    if (id) {
      await sbAdmin
        .from('chat_sessions')
        .update({ messages: [...messages, aiResponse] })
        .eq('id', id);
    }

    return NextResponse.json({ response: aiResponse }, { status: 200 });
  } catch (error: any) {
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
