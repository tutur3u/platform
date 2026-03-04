import { MAX_CHAT_MESSAGE_LENGTH } from '@tuturuuu/utils/constants';
import type { ModelMessage, UIMessage } from 'ai';
import { convertToModelMessages } from 'ai';
import {
  getLatestUserMessageWithAttachments,
  getMessageAttachments,
} from '../chat-attachment-metadata';
import {
  injectFileDigestContextIntoUiMessages,
  resolveChatFileDigests,
} from './message-file-processing';

export const MAX_CONTEXT_MESSAGES = 10;
export const ATTACHMENT_ONLY_PLACEHOLDERS = new Set([
  'Please analyze the attached file(s).',
  'Please analyze the attached file(s)',
]);

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json | undefined };

type InsertChatMessageArgs = {
  chat_id: string;
  content: string;
  creator_id: string;
  id?: string;
  metadata?: Json;
  model?: string;
  role: 'USER';
};

type ChatMessageInsertError = {
  code?: string | null;
  message: string;
};

type InsertChatMessageResult = PromiseLike<{
  error: ChatMessageInsertError | null;
}>;

type ExistingChatMessageRecord = {
  chat_id: string;
  creator_id: string;
  id: string;
  role: string;
};

type FindExistingChatMessageResult = PromiseLike<{
  data: ExistingChatMessageRecord | null;
  error: ChatMessageInsertError | null;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function insertUserChatMessageSafely({
  findExistingMessageById,
  insertChatMessage,
  message,
}: {
  findExistingMessageById: (id: string) => FindExistingChatMessageResult;
  insertChatMessage: (args: InsertChatMessageArgs) => InsertChatMessageResult;
  message: InsertChatMessageArgs;
}): Promise<{ error: { message: string } | null }> {
  if (!message.id) {
    return insertChatMessage(message);
  }

  const { error: insertError } = await insertChatMessage(message);
  if (!insertError) {
    return { error: null };
  }

  const isDuplicateInsert =
    insertError.code === '23505' ||
    /duplicate key value/i.test(insertError.message);
  if (!isDuplicateInsert) {
    return { error: insertError };
  }

  const { data: existingMessage, error: existingMessageError } =
    await findExistingMessageById(message.id);

  if (existingMessageError) {
    return { error: existingMessageError };
  }

  if (
    existingMessage &&
    existingMessage.chat_id === message.chat_id &&
    existingMessage.creator_id === message.creator_id &&
    existingMessage.role === message.role
  ) {
    return { error: null };
  }

  if (existingMessage) {
    return {
      error: {
        message: 'Message ID already exists for a different chat message.',
      },
    };
  }

  return { error: insertError };
}

function validateModelMessages(modelMessages: ModelMessage[]): Response | null {
  for (const message of modelMessages) {
    if (
      typeof message.content === 'string' &&
      message.content.length > MAX_CHAT_MESSAGE_LENGTH
    ) {
      return new Response(
        `Message too long (max ${MAX_CHAT_MESSAGE_LENGTH} characters)`,
        { status: 400 }
      );
    }

    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (
          part.type === 'text' &&
          part.text.length > MAX_CHAT_MESSAGE_LENGTH
        ) {
          return new Response(
            `Message too long (max ${MAX_CHAT_MESSAGE_LENGTH} characters)`,
            { status: 400 }
          );
        }
      }
    }
  }

  return null;
}

function truncateProcessedMessages(
  processedMessages: ModelMessage[]
): ModelMessage[] {
  if (processedMessages.length <= MAX_CONTEXT_MESSAGES) {
    return processedMessages;
  }

  const systemMessages = processedMessages.filter(
    (message) => message.role === 'system'
  );
  const nonSystemMessages = processedMessages.filter(
    (message) => message.role !== 'system'
  );
  if (systemMessages.length >= MAX_CONTEXT_MESSAGES) {
    return systemMessages.slice(-MAX_CONTEXT_MESSAGES);
  }

  const allowedNonSystemCount = Math.max(
    MAX_CONTEXT_MESSAGES - systemMessages.length,
    0
  );
  const truncatedMessages = [
    ...systemMessages,
    ...nonSystemMessages.slice(-allowedNonSystemCount),
  ];

  console.info('Truncated processed chat context', {
    originalLength: systemMessages.length + nonSystemMessages.length,
    resultingLength: truncatedMessages.length,
    preservedSystemMessages: systemMessages.length,
  });

  return truncatedMessages;
}

export async function prepareProcessedMessages(
  normalizedMessages: UIMessage[],
  wsId: string | undefined,
  chatId: string,
  userId: string,
  creditWsId?: string | null
): Promise<{ processedMessages: ModelMessage[] } | { error: Response }> {
  const latestAttachmentTurn =
    getLatestUserMessageWithAttachments(normalizedMessages);
  let messagesWithFileContext = normalizedMessages;

  if (wsId && chatId && latestAttachmentTurn.attachments.length > 0) {
    const { digestBlocks } = await resolveChatFileDigests({
      chatId,
      chatFiles: latestAttachmentTurn.attachments,
      creditWsId,
      messageId: latestAttachmentTurn.message?.id,
      userId,
      wsId,
    });

    messagesWithFileContext = await injectFileDigestContextIntoUiMessages({
      digestBlocks,
      messages: normalizedMessages,
      targetMessageId: latestAttachmentTurn.message?.id,
    });
  }

  const modelMessages = await convertToModelMessages(messagesWithFileContext);
  const validationError = validateModelMessages(modelMessages);
  if (validationError) {
    return { error: validationError };
  }

  return { processedMessages: truncateProcessedMessages(modelMessages) };
}

export function rewriteAttachmentPathsInMessages(
  normalizedMessages: UIMessage[],
  movedPaths: ReadonlyMap<string, string>
): UIMessage[] {
  if (movedPaths.size === 0) return normalizedMessages;

  return normalizedMessages.map((message) => {
    if (!isRecord(message.metadata)) {
      return message;
    }

    const attachments = getMessageAttachments(message);
    if (attachments.length === 0) {
      return message;
    }

    const rewrittenAttachments = attachments.map((attachment) => ({
      ...attachment,
      storagePath:
        movedPaths.get(attachment.storagePath) ?? attachment.storagePath,
    }));

    return {
      ...message,
      metadata: {
        ...message.metadata,
        attachments: rewrittenAttachments,
      },
    };
  });
}

function extractUserMessageText(message: UIMessage): string {
  return (message.parts ?? [])
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function isAttachmentOnlyUserTurn(message: UIMessage): boolean {
  const hasAttachments = getMessageAttachments(message).length > 0;
  if (!hasAttachments) return false;

  const text = extractUserMessageText(message);
  return text.length === 0 || ATTACHMENT_ONLY_PLACEHOLDERS.has(text);
}

function normalizePersistedUserMessageText(
  text: string,
  hasAttachments: boolean
): string {
  if (!hasAttachments) return text;
  return ATTACHMENT_ONLY_PLACEHOLDERS.has(text) ? '' : text;
}

type PersistLatestUserMessageParams = {
  chatId: string;
  findExistingMessageById: (id: string) => FindExistingChatMessageResult;
  insertChatMessage: (args: InsertChatMessageArgs) => InsertChatMessageResult;
  model: string;
  normalizedMessages: UIMessage[];
  source: 'Mira' | 'Rewise';
  userId: string;
};

function getLatestUserMessage(
  normalizedMessages: UIMessage[]
): UIMessage | undefined {
  return [...normalizedMessages]
    .reverse()
    .find((message) => message.role === 'user');
}

function normalizeModelName(model: string): string {
  return (model.includes('/') ? model.split('/').pop()! : model).toLowerCase();
}

export async function persistLatestUserMessage({
  chatId,
  findExistingMessageById,
  insertChatMessage,
  model,
  normalizedMessages,
  source,
  userId,
}: PersistLatestUserMessageParams): Promise<Response | null> {
  const latestUserMessage = getLatestUserMessage(normalizedMessages);
  if (!latestUserMessage) {
    return null;
  }

  const hasAttachments = getMessageAttachments(latestUserMessage).length > 0;
  const messageContent = normalizePersistedUserMessageText(
    extractUserMessageText(latestUserMessage),
    hasAttachments
  );
  if (!messageContent && !hasAttachments) {
    console.log('No message found');
    throw new Error('No message found');
  }

  const { error: insertMsgError } = await insertUserChatMessageSafely({
    findExistingMessageById,
    insertChatMessage,
    message: {
      chat_id: chatId,
      content: messageContent,
      creator_id: userId,
      ...(latestUserMessage.id ? { id: latestUserMessage.id } : {}),
      metadata: {
        ...(latestUserMessage.metadata ?? {}),
        source,
      } as Json,
      model: normalizeModelName(model),
      role: 'USER',
    },
  });

  if (insertMsgError) {
    console.log('ERROR ORIGIN: ROOT START');
    console.log(insertMsgError);
    throw new Error(insertMsgError.message);
  }

  console.log('User message saved to database');
  return null;
}
