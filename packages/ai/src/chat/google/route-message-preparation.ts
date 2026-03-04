import type { Json } from '@tuturuuu/types';
import { MAX_CHAT_MESSAGE_LENGTH } from '@tuturuuu/utils/constants';
import type { ModelMessage, UIMessage } from 'ai';
import { convertToModelMessages } from 'ai';
import {
  FILE_ONLY_PLACEHOLDERS,
  getLatestUserAttachments,
  getMessageAttachments,
} from '../chat-attachment-metadata';
import {
  injectFileDigestContextIntoUiMessages,
  resolveChatFileDigests,
} from './message-file-processing';

export const MAX_CONTEXT_MESSAGES = 10;

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
  content: string | null;
  creator_id: string;
  id: string;
  metadata: Json | null;
  model: string | null;
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
    existingMessage.role === message.role &&
    (existingMessage.content ?? '') === (message.content ?? '') &&
    JSON.stringify(existingMessage.metadata ?? {}) ===
      JSON.stringify(message.metadata ?? {}) &&
    (existingMessage.model ?? '') === (message.model ?? '')
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
  const currentTurnAttachments = getLatestUserAttachments(normalizedMessages);
  let messagesWithFileContext = normalizedMessages;

  if (wsId && chatId && currentTurnAttachments.attachments.length > 0) {
    try {
      const { digestBlocks } = await resolveChatFileDigests({
        chatId,
        chatFiles: currentTurnAttachments.attachments,
        creditWsId,
        messageId: currentTurnAttachments.message?.id,
        userId,
        wsId,
      });

      messagesWithFileContext = await injectFileDigestContextIntoUiMessages({
        digestBlocks,
        messages: normalizedMessages,
        targetMessageId: currentTurnAttachments.message?.id,
      });
    } catch (error) {
      console.error('[AI Chat] Failed to resolve or inject file digests:', {
        chatId: chatId.slice(0, 8),
        messageId: currentTurnAttachments.message?.id?.slice(0, 8) ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fail open: continue with original messages
      messagesWithFileContext = normalizedMessages;
    }
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
  return text.length === 0 || FILE_ONLY_PLACEHOLDERS.has(text);
}

function normalizePersistedUserMessageText(
  text: string,
  hasAttachments: boolean
): string {
  if (!hasAttachments) return text;
  return FILE_ONLY_PLACEHOLDERS.has(text) ? '' : text;
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
  if (!model) return '';
  const modelParts = model.split('/');
  const normalizedModel = model.includes('/')
    ? (modelParts[modelParts.length - 1] ?? model)
    : model;
  return normalizedModel.toLowerCase();
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
    console.error('Failed to persist latest user message.', {
      chatId: chatId.slice(0, 8),
      messageId: latestUserMessage.id?.slice(0, 8) ?? null,
      operation: 'persist_latest_user_message',
      userId: userId.slice(0, 8),
      code: 'persist_failed',
    });
    throw new Error('Failed to persist user message');
  }

  console.log('User message saved to database');
  return null;
}
