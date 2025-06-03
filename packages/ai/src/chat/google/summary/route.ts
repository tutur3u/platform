<<<<<<<< HEAD:packages/ai/src/chat/google/summary/route.ts
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/generative-ai';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Message } from 'ai';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
========
import { createPATCH } from '@tuturuuu/ai/chat/google/summary/route';
>>>>>>>> upstream/main:apps/rewise/src/app/api/ai/chat/google/summary/route.ts

export const config = {
  maxDuration: 90,
  preferredRegion: 'sin1',
  runtime: 'edge',
};

<<<<<<<< HEAD:packages/ai/src/chat/google/summary/route.ts
const model = 'gemini-2.0-flash-001';

export function createPATCH(options: { serverAPIKeyFallback?: boolean } = {}) {
  return async function handler(req: NextRequest) {
    const { id } = (await req.json()) as {
      id?: string;
    };

    try {
      if (!id) return new Response('Missing chat ID', { status: 400 });

      // eslint-disable-next-line no-undef
      // eslint-disable-next-line no-undef
      const apiKey =
        (await cookies()).get('google_api_key')?.value ||
        (options.serverAPIKeyFallback
          ? process.env.GOOGLE_GENERATIVE_AI_API_KEY
          : undefined);
      if (!apiKey) return new Response('Missing API key', { status: 400 });

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return new Response('Unauthorized', { status: 401 });

      const { data: rawMessages, error: messagesError } = await supabase
        .from('ai_chat_messages')
        .select('id, content, role')
        .eq('chat_id', id)
        .order('created_at', { ascending: true });

      if (messagesError)
        return new Response(messagesError.message, { status: 500 });

      if (!rawMessages)
        return new Response('Internal Server Error', { status: 500 });

      if (rawMessages.length === 0)
        return new Response('No messages found', { status: 404 });

      const messages = rawMessages.map((msg) => ({
        ...msg,
        role: msg.role.toLowerCase(),
      })) as Message[];

      if (!messages[messages.length - 1]?.id)
        return new Response('Internal Server Error', { status: 500 });

      if (messages[messages.length - 1]?.role === 'user')
        return new Response('Cannot summarize user message', { status: 400 });

      const prompt = buildGooglePrompt(messages);

      if (!prompt)
        return new Response('Internal Server Error', { status: 500 });

      const genAI = new GoogleGenerativeAI(apiKey);

      const geminiRes = await genAI
        .getGenerativeModel({
          model,
          generationConfig,
          safetySettings,
        })
        .generateContent(prompt);

      const completion =
        geminiRes.response.candidates?.[0]?.content.parts[0]?.text;

      if (!completion) return new Response('No content found', { status: 404 });

      const { error } = await supabase
        .from('ai_chats')
        .update({
          latest_summarized_message_id: messages[messages.length - 1]!.id,
          summary: completion,
        })
        .eq('id', id);

      if (error) return new Response(error.message, { status: 500 });

      return new Response(JSON.stringify({ response: completion }), {
        status: 200,
      });
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
  };
}

const normalizeGoogle = (message: Message) => ({
  role:
    message.role === 'user'
      ? 'user'
      : ('model' as 'user' | 'function' | 'model'),
  parts: [{ text: message.content }],
========
const PATCH = createPATCH({
  serverAPIKeyFallback: true,
>>>>>>>> upstream/main:apps/rewise/src/app/api/ai/chat/google/summary/route.ts
});

export { PATCH };
