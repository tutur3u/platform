import { MAX_CHAT_MESSAGE_LENGTH } from '@tuturuuu/utils/constants';
import type { ModelMessage, UIMessage } from 'ai';
import { convertToModelMessages } from 'ai';
import { processMessagesWithFiles } from './message-file-processing';

export const MAX_CONTEXT_MESSAGES = 10;

type SupabaseRpcClientLike = {
  message: string;
  chat_id: string;
  source: 'Mira' | 'Rewise';
};

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
  chatId: string
): Promise<{ processedMessages: ModelMessage[] } | { error: Response }> {
  const modelMessages = await convertToModelMessages(normalizedMessages);
  const validationError = validateModelMessages(modelMessages);
  if (validationError) {
    return { error: validationError };
  }

  const processedMessages =
    wsId && chatId
      ? await processMessagesWithFiles(modelMessages, wsId, chatId)
      : modelMessages;

  return { processedMessages: truncateProcessedMessages(processedMessages) };
}

function extractLatestUserMessageContent(
  processedMessages: ModelMessage[]
): string {
  const userMessages = processedMessages.filter(
    (msg: ModelMessage) => msg.role === 'user'
  );

  const lastMessage = userMessages[userMessages.length - 1];
  if (typeof lastMessage?.content === 'string') {
    return lastMessage.content;
  }

  if (Array.isArray(lastMessage?.content)) {
    return lastMessage.content
      .map((part) => {
        if (part.type === 'text') return part.text;
        if (part.type === 'image') return '[Image attached]';
        if (part.type === 'file')
          return `[File: ${(part as { name?: string }).name || 'attached'}]`;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return 'Message with attachments';
}

type PersistLatestUserMessageParams = {
  processedMessages: ModelMessage[];
  chatId: string;
  insertChatMessage: (
    args: SupabaseRpcClientLike
  ) => PromiseLike<{ error: { message: string } | null }>;
  source: 'Mira' | 'Rewise';
};

export async function persistLatestUserMessage({
  processedMessages,
  chatId,
  insertChatMessage,
  source,
}: PersistLatestUserMessageParams): Promise<Response | null> {
  if (processedMessages.length === 1) {
    return null;
  }

  const messageContent = extractLatestUserMessageContent(processedMessages);
  if (!messageContent) {
    console.log('No message found');
    throw new Error('No message found');
  }

  const { error: insertMsgError } = await insertChatMessage({
    message: messageContent,
    chat_id: chatId,
    source,
  });

  if (insertMsgError) {
    console.log('ERROR ORIGIN: ROOT START');
    console.log(insertMsgError);
    throw new Error(insertMsgError.message);
  }

  console.log('User message saved to database');
  return null;
}
