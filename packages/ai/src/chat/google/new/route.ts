import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types';
import { gateway, generateText, type UIMessage } from 'ai';
import { NextResponse } from 'next/server';
import { normalizeChatAttachmentMetadata } from '../../chat-attachment-metadata';
import { insertUserChatMessageSafely } from '../route-message-preparation';

const HUMAN_PROMPT = '\n\nHuman:';
const AI_PROMPT = '\n\nAssistant:';
const FILE_ONLY_PLACEHOLDERS = new Set([
  'Please analyze the attached file(s).',
  'Please analyze the attached file(s)',
]);

/** Always use a lightweight model for title generation */
const TITLE_MODEL = 'google/gemini-2.5-flash-lite';

function buildTitleSeed(
  message: string | undefined,
  messageMetadata: Record<string, unknown> | undefined
): string {
  const trimmed = message?.trim() ?? '';
  if (trimmed.length > 0 && !FILE_ONLY_PLACEHOLDERS.has(trimmed)) {
    return `"${trimmed}"`;
  }

  const attachments = normalizeChatAttachmentMetadata(
    messageMetadata?.attachments
  );
  if (attachments.length === 0) {
    return `"${trimmed || 'New chat'}"`;
  }

  const describedAttachments = attachments.slice(0, 3).map((attachment) => {
    const label = attachment.alias || attachment.name;
    const mediaFamily = attachment.type?.split('/')[0] ?? 'file';
    return `${mediaFamily} file "${label}"`;
  });
  const remainingCount = attachments.length - describedAttachments.length;

  return `The conversation starts with ${describedAttachments.join(', ')}${
    remainingCount > 0 ? ` and ${remainingCount} more file(s)` : ''
  }.`;
}

export function normalizeInitialUserMessageContent(
  message: string,
  messageMetadata: Record<string, unknown> | undefined
): string {
  const trimmed = message.trim();
  const attachments = normalizeChatAttachmentMetadata(
    messageMetadata?.attachments
  );

  if (attachments.length > 0 && FILE_ONLY_PLACEHOLDERS.has(trimmed)) {
    return '';
  }

  return trimmed;
}

export function createPOST(
  _options: {
    /** Gateway provider prefix for bare model names. Defaults to 'google'. */
    defaultProvider?: string;
  } = {}
) {
  return async function handler(req: Request) {
    try {
      const { id, isMiraMode, message, messageId, messageMetadata, model } =
        (await req.json()) as {
          id?: string;
          isMiraMode?: boolean;
          messageMetadata?: Record<string, unknown>;
          messageId?: string;
          model?: string;
          message?: string;
        };

      if (!message)
        return NextResponse.json('No message provided', { status: 400 });

      const supabase = await createClient();
      const sbAdmin = await createAdminClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return NextResponse.json('Unauthorized', { status: 401 });

      const prompt = buildPrompt([
        {
          id: 'initial-message',
          parts: [
            {
              type: 'text',
              text: buildTitleSeed(message, messageMetadata),
            },
          ],
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

      const { data: chat, error: chatError } = await sbAdmin
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

      const persistedContent = normalizeInitialUserMessageContent(
        message,
        messageMetadata
      );
      const persistedMetadata = {
        ...(messageMetadata ?? {}),
        source: isMiraMode ? 'Mira' : 'Rewise',
      } as Json;

      const insertArgs = {
        chat_id: chat.id,
        content: persistedContent,
        creator_id: user.id,
        ...(messageId ? { id: messageId } : {}),
        metadata: persistedMetadata,
        model: resolvedModel,
        role: 'USER' as const,
      };

      const { error: messageError } = await insertUserChatMessageSafely({
        findExistingMessageById: (existingMessageId) =>
          sbAdmin
            .from('ai_chat_messages')
            .select('id, chat_id, creator_id, role')
            .eq('id', existingMessageId)
            .maybeSingle(),
        insertChatMessage: (args) =>
          sbAdmin.from('ai_chat_messages').insert([args]),
        message: insertArgs,
      });

      if (messageError) {
        const { error: cleanupError } = await sbAdmin
          .from('ai_chats')
          .delete()
          .eq('id', chat.id);

        console.error('Failed to persist initial user message for new chat.', {
          chatId: chat.id.slice(0, 8),
          code:
            typeof messageError === 'object' &&
            messageError &&
            'code' in messageError
              ? String(messageError.code ?? 'persist_failed')
              : 'persist_failed',
          cleanupFailed: Boolean(cleanupError),
        });
        return NextResponse.json(messageError.message, { status: 500 });
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
