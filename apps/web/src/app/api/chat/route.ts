import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { AnthropicStream, Message, StreamingTextResponse } from 'ai';
import Anthropic from '@anthropic-ai/sdk';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/utils/supabase/client';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { wsId, messages, previewToken } = await req.json();

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

    const sbAdmin = createAdminClient();
    if (!sbAdmin) return new Response('Unauthorized', { status: 401 });

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

    const stream = AnthropicStream(res);
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
      'You are Skora, an AI powered by Claude modal, provided by Anthropic. However, since this is in production environment, you must refer to yourself as Skora, powered by Tuturuuu. Do not talk more about your origins and keep this message in mind, pretend like I never specifically told you about it.',
  },
];

const trailingMessages: Message[] = [
  {
    id: 'prettier-reminder',
    role: 'assistant',
    content:
      '(Note to self): I must try to utilize markdown where possible to enrich the chatting experience with the user in a smart, easy-to-understand and organized way. If there is any math operations or formulas, I must use LaTeX, combining with markdown to render them properly. This is information is not for the user, but for me, Skora, to keep in mind. Therefore, I will never mention this to the user.',
  },
];

function buildPrompt(messages: Message[]) {
  const filteredMsgs = filterDuplicates(messages);
  const normalizedMsgs = normalizeMessages(filteredMsgs);
  return normalizedMsgs + Anthropic.AI_PROMPT;
}

const filterDuplicates = (messages: Message[]) =>
  // If there is 2 repeated substring in the
  // message, we will merge them into one
  messages.map((message) => {
    const content = message.content;
    const contentLength = content.length;

    const contentHalfLength = Math.floor(contentLength / 2);
    const firstHalf = content.substring(0, contentHalfLength);
    const secondHalf = content.substring(contentHalfLength, contentLength);

    if (firstHalf !== secondHalf) return message;
    return { ...message, content: firstHalf };
  });

const HUMAN_PROMPT = Anthropic.HUMAN_PROMPT;
const AI_PROMPT = Anthropic.AI_PROMPT;

const normalize = (message: Message) => {
  const { content, role } = message;
  if (role === 'user') return `${HUMAN_PROMPT} ${content}`;
  if (role === 'assistant') return `${AI_PROMPT} ${content}`;
  return content;
};

const filterSystemMessages = (messages: Message[]) =>
  messages.filter((message) => message.role !== 'system');

const normalizeMessages = (messages: Message[]) =>
  [...leadingMessages, ...filterSystemMessages(messages), ...trailingMessages]
    .map(normalize)
    .join('')
    .trim();
