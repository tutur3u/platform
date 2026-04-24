import { MAX_CHAT_MESSAGE_LENGTH } from '@tuturuuu/utils/constants';
import type {
  FilePart,
  ImagePart,
  ModelMessage,
  TextPart,
  UIMessage,
} from 'ai';
import { convertToModelMessages } from 'ai';
import { processMessagesWithFiles } from './message-file-processing';

export const MAX_CONTEXT_MESSAGES = 10;

const YOUTUBE_URL_REGEX =
  /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com)\/\S+|https?:\/\/(?:www\.)?youtu\.be\/\S+/gi;

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

function getTextFromContent(content: ModelMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n');
}

export function normalizeYoutubeVideoUrlForGemini(
  value: string
): string | null {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:') return null;

    if (hostname === 'youtu.be' || hostname === 'www.youtu.be') {
      const videoId = parsed.pathname.split('/').filter(Boolean)[0];
      return videoId ? `https://youtu.be/${videoId}` : null;
    }

    const isYoutubeHost =
      hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'music.youtube.com' ||
      hostname === 'youtube-nocookie.com' ||
      hostname === 'www.youtube-nocookie.com';
    if (!isYoutubeHost) return null;

    if (parsed.pathname === '/watch') {
      const videoId = parsed.searchParams.get('v');
      return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
    }

    for (const prefix of ['/shorts/', '/embed/', '/live/']) {
      if (parsed.pathname.startsWith(prefix)) {
        const videoId = parsed.pathname.slice(prefix.length).split('/')[0];
        return videoId ? `https://www.youtube.com${prefix}${videoId}` : null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function getFirstYoutubeVideoUrl(
  content: ModelMessage['content']
): string | null {
  const text = getTextFromContent(content);
  for (const match of text.matchAll(YOUTUBE_URL_REGEX)) {
    const normalized = normalizeYoutubeVideoUrlForGemini(
      match[0].replace(/[),.;!?]+$/g, '')
    );
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function hasYoutubeVideoFilePart(content: ModelMessage['content']): boolean {
  if (!Array.isArray(content)) {
    return false;
  }

  return content.some(
    (part) =>
      part.type === 'file' &&
      part.mediaType === 'video/mp4' &&
      typeof part.data === 'string' &&
      normalizeYoutubeVideoUrlForGemini(part.data) !== null
  );
}

export function attachYoutubeVideoInputToLatestUserMessage(
  messages: ModelMessage[],
  enabled: boolean
): ModelMessage[] {
  if (!enabled) {
    return messages;
  }

  const latestUserIndex = messages.findLastIndex(
    (message) => message.role === 'user'
  );
  if (latestUserIndex === -1) {
    return messages;
  }

  const latestUserMessage = messages[latestUserIndex]!;
  if (hasYoutubeVideoFilePart(latestUserMessage.content)) {
    return messages;
  }

  const youtubeUrl = getFirstYoutubeVideoUrl(latestUserMessage.content);
  if (!youtubeUrl) {
    return messages;
  }

  const contentParts: Array<TextPart | ImagePart | FilePart> = [];
  if (typeof latestUserMessage.content === 'string') {
    contentParts.push({ type: 'text', text: latestUserMessage.content });
  } else if (Array.isArray(latestUserMessage.content)) {
    for (const part of latestUserMessage.content) {
      if (
        part.type === 'text' ||
        part.type === 'image' ||
        part.type === 'file'
      ) {
        contentParts.push(part);
      }
    }
  }

  contentParts.push({
    type: 'file',
    data: youtubeUrl,
    mediaType: 'video/mp4',
  });

  const processedMessages = [...messages];
  processedMessages[latestUserIndex] = {
    role: 'user',
    content: contentParts,
  };

  return processedMessages;
}

export async function prepareProcessedMessages(
  normalizedMessages: UIMessage[],
  wsId: string | undefined,
  chatId: string,
  request?: Pick<Request, 'headers'>,
  options?: { attachYoutubeVideoInput?: boolean }
): Promise<{ processedMessages: ModelMessage[] } | { error: Response }> {
  const modelMessages = await convertToModelMessages(normalizedMessages);
  const validationError = validateModelMessages(modelMessages);
  if (validationError) {
    return { error: validationError };
  }

  const processedMessages =
    wsId && chatId
      ? await processMessagesWithFiles(modelMessages, wsId, chatId, request)
      : modelMessages;

  return {
    processedMessages: truncateProcessedMessages(
      attachYoutubeVideoInputToLatestUserMessage(
        processedMessages,
        options?.attachYoutubeVideoInput ?? false
      )
    ),
  };
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
        if (part.type === 'file') {
          if (
            part.mediaType === 'video/mp4' &&
            typeof part.data === 'string' &&
            normalizeYoutubeVideoUrlForGemini(part.data)
          ) {
            return '';
          }

          return `[File: ${(part as { name?: string }).name || 'attached'}]`;
        }
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
