import type { UIMessage } from 'ai';

export type ChatAttachmentMetadata = {
  alias?: string | null;
  name: string;
  size?: number;
  storagePath: string;
  type?: string;
};

export const FILE_ONLY_PLACEHOLDERS = new Set([
  'Please analyze the attached file(s).',
  'Please analyze the attached file(s)',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function stripChatUploadTimestampPrefix(name: string): string {
  const match = name.match(/^(?:\d{10}|\d{13})_(.+)$/);
  return match?.[1] ?? name;
}

export function normalizeChatAttachmentMetadata(
  value: unknown
): ChatAttachmentMetadata[] {
  if (!Array.isArray(value)) return [];

  const normalized: ChatAttachmentMetadata[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) continue;

    const storagePath =
      typeof entry.storagePath === 'string' ? entry.storagePath.trim() : '';
    const rawName = typeof entry.name === 'string' ? entry.name.trim() : '';

    if (!storagePath || !rawName) continue;

    normalized.push({
      alias:
        typeof entry.alias === 'string' && entry.alias.trim().length > 0
          ? entry.alias.trim()
          : null,
      name: stripChatUploadTimestampPrefix(rawName),
      size:
        typeof entry.size === 'number' && Number.isFinite(entry.size)
          ? Math.max(0, Math.floor(entry.size))
          : undefined,
      storagePath,
      type:
        typeof entry.type === 'string' && entry.type.trim().length > 0
          ? entry.type.trim()
          : undefined,
    });
  }

  return normalized;
}

export function getMessageAttachments(
  message: Pick<UIMessage, 'metadata'> | null | undefined
): ChatAttachmentMetadata[] {
  if (!message?.metadata || !isRecord(message.metadata)) return [];
  return normalizeChatAttachmentMetadata(message.metadata.attachments);
}

export function getLatestUserMessageWithAttachments(messages: UIMessage[]): {
  attachments: ChatAttachmentMetadata[];
  message: UIMessage | null;
} {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'user') continue;

    const attachments = getMessageAttachments(message);
    if (attachments.length > 0) {
      return { attachments, message };
    }
  }

  return { attachments: [], message: null };
}

export function getLatestUserAttachments(messages: UIMessage[]): {
  attachments: ChatAttachmentMetadata[];
  message: UIMessage | null;
} {
  const latestMessage = messages[messages.length - 1];
  if (!latestMessage || latestMessage.role !== 'user') {
    return { attachments: [], message: null };
  }

  return {
    attachments: getMessageAttachments(latestMessage),
    message: latestMessage,
  };
}
