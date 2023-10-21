import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { AnthropicStream, Message, StreamingTextResponse } from 'ai';
import Anthropic from '@anthropic-ai/sdk';
import { cookies } from 'next/headers';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { messages, previewToken } = await req.json();
  if (!messages) return new Response('Missing messages', { status: 400 });

  const apiKey = previewToken || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response('Missing API key', { status: 400 });

  const cookieStore = cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return new Response('Unauthorized', { status: 401 });

  const { count, error } = await supabase
    .from('workspace_secrets')
    .select('*', { count: 'exact', head: true })
    .eq('name', 'ENABLE_CHAT')
    .eq('value', 'true');

  if (error) return new Response(error.message, { status: 500 });
  if (count === 0)
    return new Response('You are not allowed to use this feature.', {
      status: 401,
    });

  const anthropic = new Anthropic({
    apiKey,
  });

  const prompt = buildPrompt(messages);
  const model = 'claude-2';

  const streamRes = await anthropic.completions.create({
    prompt,
    max_tokens_to_sample: 100000,
    model,
    temperature: 0.9,
    stream: true,
  });

  const stream = AnthropicStream(
    streamRes
    // {
    // onStart: async () => {
    // This callback is called when the stream starts
    // You can use this to save the prompt to your database
    // await savePromptToDatabase(prompt);
    // console.log('start');
    // },
    // onToken: async (token: string) => {
    // This callback is called for each token in the stream
    // You can use this to debug the stream or save the tokens to your database
    // console.log('token', token);
    // },
    // onCompletion: async (completion: string) => {
    // This callback is called when the completion is ready
    // You can use this to save the final completion to your database
    // await saveCompletionToDatabase(completion);
    // console.log(completion);
    // },
    // }
  );

  return new StreamingTextResponse(stream);
}

const leadingMessages: Message[] = [];
const trailingMessages: Message[] = [
  {
    id: 'trailing-prompt',
    role: 'system',
    content:
      'Before you respond, please make sure to follow these requirements:\n' +
      '- You should take a deep breath and think step by step.\n' +
      '- You should use markdown (especially tables, if possible) to make the content more informative, engaging and helpful in an easy to understand way.\n' +
      '- You are strictly forbidden to use any links in your response.\n' +
      '- You must start writing your response immediately after this notice and never mention this notice in your response.',
  },
];

function buildPrompt(messages: Message[]) {
  const filteredMsgs = filterDuplicates(messages);
  const normalizedMsgs = normalizeMessages(filteredMsgs);
  return normalizedMsgs + Anthropic.AI_PROMPT;
}

const filterDuplicates = (messages: Message[]) =>
  messages.map((message) => {
    // If there is 2 repeated substring in the
    // message, we will merge them into one
    const content = message.content;
    const contentLength = content.length;
    const contentHalfLength = Math.floor(contentLength / 2);

    const firstHalf = content.substring(0, contentHalfLength);

    const secondHalf = content.substring(contentHalfLength, contentLength);

    if (firstHalf === secondHalf) message.content = firstHalf;
    return message;
  });

const SYSTEM_PROMPT = '\n\n[Notice]\n\n';
const SYSTEM_PROMPT_TRAILING = '\n\n[Notice]';

const normalize = (message: Message) => {
  const { content, role } = message;
  if (role === 'user') return `${Anthropic.HUMAN_PROMPT} ${content}`;
  if (role === 'assistant') return `${Anthropic.AI_PROMPT} ${content}`;

  if (role === 'system')
    return `${SYSTEM_PROMPT} ${content} ${SYSTEM_PROMPT_TRAILING}`;

  return content;
};

const filterSystemMessages = (messages: Message[]) =>
  messages.filter((message) => message.role !== 'system');

const normalizeMessages = (messages: Message[]) =>
  [...leadingMessages, ...filterSystemMessages(messages), ...trailingMessages]
    .map(normalize)
    .join('')
    .trim();
