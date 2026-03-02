import { createClient } from '@tuturuuu/supabase/next/server';
import { gateway, generateText, type UIMessage } from 'ai';
import { NextResponse } from 'next/server';

const HUMAN_PROMPT = '\n\nHuman:';
const AI_PROMPT = '\n\nAssistant:';

/** Always use a lightweight model for title generation */
const TITLE_MODEL = 'google/gemini-2.5-flash-lite';

export function createPOST(
  _options: {
    /** Gateway provider prefix for bare model names. Defaults to 'google'. */
    defaultProvider?: string;
  } = {}
) {
  return async function handler(req: Request) {
    try {
      const { id, model, message, isMiraMode } = (await req.json()) as {
        id?: string;
        model?: string;
        message?: string;
        isMiraMode?: boolean;
      };

      if (!message)
        return NextResponse.json('No message provided', { status: 400 });

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return NextResponse.json('Unauthorized', { status: 401 });

      const prompt = buildPrompt([
        {
          id: 'initial-message',
          parts: [{ type: 'text', text: `"${message}"` }],
          role: 'user',
        },
      ]);

      // Always use TITLE_MODEL for generating chat titles (cheap + fast)
      const result = await generateText({
        model: gateway(TITLE_MODEL),
        prompt,
        providerOptions: {
          google: {
            safetySettings: [
              {
                category: 'HARM_CATEGORY_HARASSMENT',
                threshold: 'BLOCK_NONE',
              },
              {
                category: 'HARM_CATEGORY_HATE_SPEECH',
                threshold: 'BLOCK_NONE',
              },
              {
                category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                threshold: 'BLOCK_NONE',
              },
              {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: 'BLOCK_NONE',
              },
            ],
          },
        },
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

      // Store bare model name for DB compatibility (ai_models FK)
      const resolvedModel = model
        ? (model.includes('/') ? model.split('/').pop()! : model).toLowerCase()
        : 'gemini-2.5-flash-lite';

      const { data: chat, error: chatError } = await supabase
        .from('ai_chats')
        .insert({
          id,
          title,
          creator_id: user.id,
          model: resolvedModel,
        })
        .select('id')
        .single();

      if (chatError) {
        console.log(chatError);
        return NextResponse.json(chatError.message, { status: 500 });
      }

      const { error: msgError } = await supabase.rpc('insert_ai_chat_message', {
        message: message,
        chat_id: chat.id,
        source: isMiraMode ? 'Mira' : 'Rewise',
      });

      if (msgError) {
        console.log(msgError);
        return NextResponse.json(msgError.message, { status: 500 });
      }

      return NextResponse.json({ id: chat.id, title }, { status: 200 });
    } catch (error: unknown) {
      console.log(error);
      return NextResponse.json(
        {
          message: `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${error instanceof Error ? error.stack : 'Unknown error'}`,
        },
        {
          status: 500,
        }
      );
    }
  };
}

const normalize = (message: UIMessage) => {
  const { parts, role } = message;
  // Extract text from parts array
  const content =
    parts?.map((part) => (part.type === 'text' ? part.text : '')).join('') ||
    '';
  if (role === 'user') return `${HUMAN_PROMPT} ${content}`;
  if (role === 'assistant') return `${AI_PROMPT} ${content}`;
  return content;
};

const normalizeMessages = (messages: UIMessage[]) =>
  [...leadingMessages, ...messages, ...trailingMessages]
    .map(normalize)
    .join('')
    .trim();

function buildPrompt(messages: UIMessage[]) {
  const normalizedMsgs = normalizeMessages(messages);
  return normalizedMsgs + AI_PROMPT;
}

const leadingMessages: UIMessage[] = [
  {
    id: 'initial-message',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: 'Please provide an initial message so I can generate a short and comprehensive title for this chat conversation.',
      },
    ],
  },
];

const trailingMessages: UIMessage[] = [
  {
    id: 'final-message',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: 'Thank you, I will respond with a title in my next response that will briefly demonstrate what the chat conversation is about, and it will only contain the title without any quotation marks, markdown, and anything else but the title. The title will be in the language you provided the initial message in.',
      },
    ],
  },
];
