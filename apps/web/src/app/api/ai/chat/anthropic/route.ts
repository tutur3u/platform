import { createAdminClient } from '@/utils/supabase/client';
import { AI_PROMPT, HUMAN_PROMPT } from '@anthropic-ai/sdk';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { AnthropicStream, Message, StreamingTextResponse } from 'ai';
import { cookies } from 'next/headers';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';
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

    const prompt = buildAnthropicPrompt(messages);
    const model = 'claude-2.1';

    const res = await fetch('https://api.anthropic.com/v1/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        prompt,
        max_tokens_to_sample: 4000,
        model,
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
        if (!completion) {
          console.log('No content found');
          throw new Error('No content found');
        }

        const { error } = await sbAdmin.from('ai_chat_messages').insert({
          chat_id: chatId,
          content: completion,
          role: 'ASSISTANT',
          model: 'CLAUDE-2.1',
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
    content: `
You are Skora, an AI by Tuturuuu, customized and engineered by Võ Hoàng Phúc - The Founder of Tuturuuu.

Here is a set of guidelines you MUST follow:

- Utilize markdown formatting (WITHOUT HTML, as it is NOT SUPPORTED) and turn your response into an essay, or even better, a blog post where possible to enrich the chatting experience with the user in a smart, easy-to-understand, and organized way.
- If there are any math operations or formulas, you MUST use LaTeX, in combination with Markdown, to render them properly.
- At THE END and ONLY at THE END of your answer, you MUST provide 3 helpful follow-up prompts that predict WHAT THE USER MIGHT ASK, note that the question MUST be asked from the user perspective (each enclosed in "@<FOLLOWUP>" and "</FOLLOWUP>" pairs and NO USAGE of Markdown or LaTeX in this section, e.g. \n\n@<FOLLOWUP>Can you elaborate on the first topic?</FOLLOWUP>\n\n@<FOLLOWUP>Can you provide an alternative solution?</FOLLOWUP>\n\n@<FOLLOWUP>How would the approach that you suggested be more suitable for my use case?</FOLLOWUP>) so that user can choose to ask you and continue the conversation with you in a meaningful and helpful way. Outside of this section, ALWAYS use Markdown and LaTeX to enrich the chatting experience with the user.
`.trim(),
  },
];

const trailingMessages: Message[] = [];

const filterDuplicate = (str: string) => {
  const strLength = str.length;
  const halfLength = Math.floor(strLength / 2);
  const firstHalf = str.substring(0, halfLength);
  const secondHalf = str.substring(halfLength, strLength);

  if (firstHalf !== secondHalf) return str;
  return firstHalf;
};

const filterDuplicates = (messages: Message[]) =>
  // If there is 2 repeated substring in the
  // message, we will merge them into one
  messages.map((message) => {
    return { ...message, content: filterDuplicate(message.content) };
  });

const normalizeAnthropic = (message: Message) => {
  const { content, role } = message;
  if (role === 'user') return `${HUMAN_PROMPT} ${content}`;
  if (role === 'assistant') return `${AI_PROMPT} ${content}`;
  return content;
};

const filterSystemMessages = (messages: Message[]) =>
  messages.filter((message) => message.role !== 'system');

const normalizeAnthropicMessages = (messages: Message[]) =>
  [...leadingMessages, ...filterSystemMessages(messages), ...trailingMessages]
    .map(normalizeAnthropic)
    .join('')
    .trim();

function buildAnthropicPrompt(messages: Message[]) {
  const filteredMsgs = filterDuplicates(messages);
  const normalizedMsgs = normalizeAnthropicMessages(filteredMsgs);
  return normalizedMsgs + AI_PROMPT;
}
