import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { gateway, streamObject } from 'ai';
import { NextResponse } from 'next/server';
import { flashcardSchema } from '../types';

export const maxDuration = 60;
export const preferredRegion = 'sin1';

const DEFAULT_MODEL_NAME = 'google/gemini-2.5-flash';

export async function POST(req: Request) {
  const sbAdmin = await createAdminClient();

  const { wsId, context } = (await req.json()) as {
    wsId?: string;
    context?: string;
  };

  try {
    // if (!id) return new Response('Missing chat ID', { status: 400 });
    if (!wsId) return new Response('Missing workspace ID', { status: 400 });
    if (!context) return new Response('Missing context', { status: 400 });

    // eslint-disable-next-line no-undef
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) return new Response('Missing API key', { status: 400 });

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return new Response('Unauthorized', { status: 401 });

    const { count, error } = await sbAdmin
      .from('workspace_secrets')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', wsId)
      .eq('name', 'ENABLE_CHAT')
      .eq('value', 'true');

    if (error) return new Response(error.message, { status: 500 });
    if (count === 0)
      return new Response('You are not allowed to use this feature.', {
        status: 401,
      });

    // let chatId = id;

    // if (!chatId) {
    //   const { data, error } = await sbAdmin
    //     .from('ai_chats')
    //     .select('id')
    //     .eq('creator_id', user?.id)
    //     .order('created_at', { ascending: false })
    //     .limit(1)
    //     .single();

    //   if (error) return new Response(error.message, { status: 500 });
    //   if (!data) return new Response('Internal Server Error', { status: 500 });

    //   chatId = data.id;
    // }

    const result = streamObject({
      model: gateway(DEFAULT_MODEL_NAME),
      // output: 'array',
      prompt:
        `Generate 10 flashcards with the following context (in the same language as the provided context): ` +
        context,
      schema: flashcardSchema,
      providerOptions: {
        google: {
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
        },
      },
      // onFinish: async (response) => {
      // console.log('AI Response:', response);
      // if (!response.object) {
      //   console.log('No content found');
      //   throw new Error('No content found');
      // }
      // const { error } = await sbAdmin.from('ai_chat_messages').insert({
      //   chat_id: chatId,
      //   creator_id: user.id,
      //   content: response.text,
      //   role: 'ASSISTANT',
      //   model: model.toLowerCase(),
      //   finish_reason: response.finishReason,
      //   prompt_tokens: response.usage.promptTokens,
      //   completion_tokens: response.usage.completionTokens,
      //   metadata: { source: 'Tuturuuu' },
      // });
      // if (error) {
      //   console.log('ERROR ORIGIN: ROOT COMPLETION');
      //   console.log(error);
      //   throw new Error(error.message);
      // }
      // console.log('AI Response saved to database');
      // },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.log(error);
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
