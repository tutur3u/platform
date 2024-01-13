import { createAdminClient } from '@/utils/supabase/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { GoogleGenerativeAIStream, Message, StreamingTextResponse } from 'ai';
import { cookies } from 'next/headers';
import { buildGooglePrompt } from '../core';

export const runtime = 'edge';
export const preferredRegion = 'sin1';
export const dynamic = 'force-dynamic';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

export async function POST(req: Request) {
  const sbAdmin = createAdminClient();
  if (!sbAdmin) return new Response('Internal Server Error', { status: 500 });

  const {
    id: chatId,
    wsId,
    messages,
    previewToken,
  } = (await req.json()) as {
    id?: string;
    wsId?: string;
    messages?: Message[];
    previewToken?: string;
  };

  try {
    if (!chatId) return new Response('Missing chat ID', { status: 400 });
    if (!wsId) return new Response('Missing workspace ID', { status: 400 });
    if (!messages) return new Response('Missing messages', { status: 400 });

    const apiKey = previewToken || process.env.GOOGLE_API_KEY;
    if (!apiKey) return new Response('Missing API key', { status: 400 });

    const cookieStore = cookies();
    const supabase = createServerComponentClient({
      cookies: () => cookieStore,
    });

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

    const prompt = buildGooglePrompt(messages);
    const model = 'gemini-pro';

    if (!prompt) return new Response('Internal Server Error', { status: 500 });

    const geminiStream = await genAI
      .getGenerativeModel({ model })
      .generateContentStream(prompt);

    const stream = GoogleGenerativeAIStream(geminiStream, {
      onStart: async () => {
        // If there is only 1 message, we will not save it to the database
        // Since it is the prompt message that created the conversation
        if (messages.length === 1) return;

        const userMessages = messages.filter(
          (msg: Message) => msg.role === 'user'
        );

        const message = userMessages[userMessages.length - 1]?.content;
        if (!message) {
          console.log('No message found');
          throw new Error('No message found');
        }

        const { error } = await sbAdmin.rpc('insert_ai_chat_message', {
          message,
          chat_id: chatId,
        });

        if (error) {
          console.log(error);
          throw new Error(error.message);
        }

        console.log('User message saved to database');
      },
      onCompletion: async (completion) => {
        if (!completion) {
          console.log('No content found');
          throw new Error('No content found');
        }

        const { error } = await sbAdmin.from('ai_chat_messages').insert({
          chat_id: chatId,
          content: completion,
          role: 'ASSISTANT',
          model: 'GOOGLE-GEMINI-PRO',
        });

        if (error) {
          console.log(error);
          throw new Error(error.message);
        }

        console.log('AI Response saved to database');
      },
    });
    return new StreamingTextResponse(stream);
  } catch (error: any) {
    console.log(error);
    return new Response(
      `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${error?.stack}`,
      {
        status: 200,
      }
    );
  }
}
