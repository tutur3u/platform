import type { ChatMessage } from '@tuturuuu/internal-api';
import { decode } from 'html-entities';

const MAX_ENTITY_DECODE_PASSES = 3;

export function decodeExternalChatContent(
  content: string,
  externalChat: boolean
) {
  if (!externalChat) return content;

  let displayContent = content;
  for (let pass = 0; pass < MAX_ENTITY_DECODE_PASSES; pass += 1) {
    const decoded = decode(displayContent, { level: 'html5', scope: 'body' });
    if (decoded === displayContent) break;
    displayContent = decoded;
  }
  return displayContent;
}

export function getChatMessageDisplayContent(
  message: Pick<ChatMessage, 'content' | 'metadata'>
) {
  return decodeExternalChatContent(
    message.content,
    message.metadata.externalChat === true
  );
}
