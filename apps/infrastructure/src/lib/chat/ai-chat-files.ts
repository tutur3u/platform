import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SessionAuthContext } from '@/lib/api-auth';
import type { ChatAttachment } from './private-rpc';

const AI_CHAT_FILE_ATTACHMENT_PREFIX = 'ai-file:';
const AI_CHAT_IMAGE_PLACEHOLDER_PATTERN = /^\s*\[Image attached\]\s*$/iu;
const AI_CHAT_FILE_PLACEHOLDER_PATTERN = /^\s*\[File:\s*.+\]\s*$/iu;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/giu;

export type AiChatMessageForAttachment = {
  content: string | null;
  id: string;
  role: string;
};

type AiChatFileObject = {
  created_at?: string | null;
  id?: string | null;
  metadata?: {
    mimetype?: string;
    size?: number;
  } | null;
  name: string;
  updated_at?: string | null;
};

export async function listAiChatAttachmentsByMessage({
  chatId,
  conversationId,
  messages,
  supabase,
  userId,
  wsId,
}: {
  chatId: string;
  conversationId: string;
  messages: AiChatMessageForAttachment[];
  supabase: SessionAuthContext['supabase'];
  userId: string;
  wsId: string;
}) {
  const attachmentsByMessageId = new Map<string, ChatAttachment[]>();
  const workspaceIds = await listAiChatResourceWorkspaceIds({
    supabase,
    userId,
    wsId,
  });
  const sbAdmin = await createAdminClient({ noCookie: true });
  const files: { file: AiChatFileObject; prefix: string; wsId: string }[] = [];

  for (const storageWsId of workspaceIds) {
    const prefix = `${storageWsId}/chats/ai/resources/${chatId}`;
    const { data, error } = await sbAdmin.storage
      .from('workspaces')
      .list(prefix, {
        limit: 1000,
        sortBy: { column: 'created_at', order: 'asc' },
      });

    if (error || !data?.length) continue;

    files.push(
      ...(data as AiChatFileObject[]).map((file) => ({
        file,
        prefix,
        wsId: storageWsId,
      }))
    );
  }

  if (files.length === 0) return attachmentsByMessageId;

  files.sort((first, second) =>
    (first.file.created_at ?? first.file.name).localeCompare(
      second.file.created_at ?? second.file.name
    )
  );

  const userMessages = messages.filter(
    (message) => message.role.toLowerCase() === 'user'
  );
  let userMessageIndex = 0;

  for (const { file, prefix, wsId: storageWsId } of files) {
    if (!file.name || file.name === '.emptyFolderPlaceholder') continue;

    const targetMessage =
      findNextAttachmentPlaceholderMessage(userMessages, userMessageIndex) ??
      userMessages.at(-1);

    if (!targetMessage) continue;

    const nextIndex = userMessages.findIndex(
      (message) => message.id === targetMessage.id
    );
    userMessageIndex = nextIndex >= 0 ? nextIndex + 1 : userMessageIndex;

    const storagePath = `${prefix}/${file.name}`;
    const attachment = toAiChatAttachment({
      conversationId,
      file,
      messageId: targetMessage.id,
      storagePath,
      userId,
      wsId: storageWsId,
    });
    const current = attachmentsByMessageId.get(targetMessage.id) ?? [];
    attachmentsByMessageId.set(targetMessage.id, [...current, attachment]);
  }

  return attachmentsByMessageId;
}

export function sanitizeAiChatMessageContent(
  content: string,
  _attachments: ChatAttachment[]
) {
  return content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !AI_CHAT_IMAGE_PLACEHOLDER_PATTERN.test(trimmed) &&
        !AI_CHAT_FILE_PLACEHOLDER_PATTERN.test(trimmed)
      );
    })
    .join('\n')
    .trim();
}

export function encodeAiChatFileAttachmentId(storagePath: string) {
  return `${AI_CHAT_FILE_ATTACHMENT_PREFIX}${encodeURIComponent(storagePath)}`;
}

export function decodeAiChatFileAttachmentId(attachmentId: string) {
  if (!attachmentId.startsWith(AI_CHAT_FILE_ATTACHMENT_PREFIX)) return null;

  try {
    return decodeURIComponent(
      attachmentId.slice(AI_CHAT_FILE_ATTACHMENT_PREFIX.length)
    );
  } catch {
    return null;
  }
}

export function isPhotoAttachment(attachment: ChatAttachment) {
  return attachment.contentType?.toLowerCase().startsWith('image/') ?? false;
}

export function extractLinks(content: string) {
  return Array.from(new Set(content.match(URL_PATTERN) ?? []));
}

async function listAiChatResourceWorkspaceIds({
  supabase,
  userId,
  wsId,
}: {
  supabase: SessionAuthContext['supabase'];
  userId: string;
  wsId: string;
}) {
  const ids = new Set([wsId]);
  const { data } = await supabase
    .from('workspace_members')
    .select('ws_id')
    .eq('user_id', userId)
    .eq('type', 'MEMBER')
    .limit(25);

  for (const item of (data ?? []) as { ws_id: string | null }[]) {
    if (item.ws_id) ids.add(item.ws_id);
  }

  return [...ids];
}

function findNextAttachmentPlaceholderMessage(
  messages: AiChatMessageForAttachment[],
  startIndex: number
) {
  for (let index = startIndex; index < messages.length; index++) {
    const message = messages[index];
    if (!message) continue;
    if (hasAttachmentPlaceholder(message.content ?? '')) return message;
  }

  return null;
}

function toAiChatAttachment({
  conversationId,
  file,
  messageId,
  storagePath,
  userId,
  wsId,
}: {
  conversationId: string;
  file: AiChatFileObject;
  messageId: string;
  storagePath: string;
  userId: string;
  wsId: string;
}): ChatAttachment {
  const filename = stripTimestampPrefix(file.name);
  const contentType =
    readString(file.metadata?.mimetype) ?? extensionToMime(filename);

  return {
    contentType,
    conversationId,
    createdAt: file.created_at ?? file.updated_at ?? new Date().toISOString(),
    filename,
    fullPath: storagePath,
    id: encodeAiChatFileAttachmentId(storagePath),
    messageId,
    sizeBytes:
      typeof file.metadata?.size === 'number' ? file.metadata.size : null,
    storagePath,
    storageWsId: wsId,
    uploaderId: userId,
  };
}

function hasAttachmentPlaceholder(content: string) {
  return content.split('\n').some((line) => {
    const trimmed = line.trim();
    return (
      AI_CHAT_IMAGE_PLACEHOLDER_PATTERN.test(trimmed) ||
      AI_CHAT_FILE_PLACEHOLDER_PATTERN.test(trimmed)
    );
  });
}

function stripTimestampPrefix(filename: string) {
  return filename.replace(/^\d+[_-]/u, '');
}

function extensionToMime(filename: string) {
  const extension = filename.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'gif':
      return 'image/gif';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'pdf':
      return 'application/pdf';
    case 'txt':
      return 'text/plain';
    default:
      return null;
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
