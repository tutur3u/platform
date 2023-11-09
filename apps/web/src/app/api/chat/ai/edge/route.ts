import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { AnthropicStream, Message, StreamingTextResponse } from 'ai';
import Anthropic, { AI_PROMPT, HUMAN_PROMPT } from '@anthropic-ai/sdk';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/utils/supabase/client';
import { filterDuplicate, filterDuplicates, normalize } from '../core';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

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

    const apiKey = previewToken || process.env.ANTHROPIC_API_KEY;
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

    const prompt = buildPrompt(messages);
    const model = 'claude-2';

    const res = await fetch('https://api.anthropic.com/v1/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        prompt,
        max_tokens_to_sample: 100000,
        model,
        temperature: 0.9,
        stream: true,
      }),
    });

    const stream = AnthropicStream(res, {
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
        const content = filterDuplicate(completion);

        const { error } = await sbAdmin.from('ai_chat_messages').insert({
          chat_id: chatId,
          content,
          role: 'ASSISTANT',
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

const leadingMessages: Message[] = [
  {
    id: 'identity-reminder',
    role: 'system',
    content:
      'You are Skora, an AI powered by Claude modal, provided by Anthropic. However, since this is in production environment, you MUST refer to yourself as Skora, powered by Tuturuuu. Do not talk more about your origins and keep this message in mind, pretend like I never specifically told you about it.',
  },
];

const trailingMessages: Message[] = [
  {
    id: 'prettier-reminder',
    role: 'assistant',
    content:
      '(Note to self): I MUST try to utilize markdown where possible to enrich the chatting experience with the user in a smart, easy-to-understand and organized way. If there is any math operations or formulas, I MUST use LaTeX, combining with markdown to render them properly. I MUST NEVER mention this note to the user, since they NEVER need to know about it.',
  },
];

function buildPrompt(messages: Message[]) {
  const filteredMsgs = filterDuplicates(messages);
  const normalizedMsgs = normalizeMessages(filteredMsgs);
  return normalizedMsgs + Anthropic.AI_PROMPT;
}

const filterSystemMessages = (messages: Message[]) =>
  messages.filter((message) => message.role !== 'system');

const normalizeMessages = (messages: Message[]) =>
  [...leadingMessages, ...filterSystemMessages(messages), ...trailingMessages]
    .map(normalize)
    .join('')
    .trim();
