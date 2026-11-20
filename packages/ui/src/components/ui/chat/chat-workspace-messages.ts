import type { ChatMessage } from '@tuturuuu/internal-api';

export function mergeConversationLatestMessage(
  messages: ChatMessage[],
  latestMessage?: ChatMessage | null
) {
  if (
    !latestMessage ||
    messages.some((message) => message.id === latestMessage.id)
  ) {
    return messages;
  }

  return [...messages, latestMessage].sort(
    (left, right) =>
      readChatMessageTimestamp(left.createdAt) -
      readChatMessageTimestamp(right.createdAt)
  );
}

function readChatMessageTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
