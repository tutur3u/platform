import type { ChatMessage } from '@tuturuuu/internal-api';
import { decode } from 'html-entities';

export function decodeExternalChatContent(
  content: string,
  externalChat: boolean
) {
  return externalChat
    ? decode(content, { level: 'html5', scope: 'body' })
    : content;
}

export function getChatMessageDisplayContent(
  message: Pick<ChatMessage, 'content' | 'metadata'>
) {
  return decodeExternalChatContent(
    message.content,
    message.metadata.externalChat === true
  );
}
