'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { AIChat } from '@tuturuuu/types';
import type { MessageFileAttachment } from './file-preview-chips';

function normalizeStoredAttachments(metadata: unknown): Array<{
  alias: string | null;
  name: string;
  size: number;
  storagePath: string;
  type: string;
}> {
  const rawAttachments =
    metadata &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    'attachments' in metadata
      ? (metadata as { attachments?: unknown }).attachments
      : null;

  if (!Array.isArray(rawAttachments)) return [];

  return rawAttachments
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }

      const storagePath =
        typeof entry.storagePath === 'string' ? entry.storagePath.trim() : '';
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';

      if (!storagePath || !name) return null;

      return {
        alias:
          typeof entry.alias === 'string' && entry.alias.trim().length > 0
            ? entry.alias.trim()
            : null,
        name,
        size:
          typeof entry.size === 'number' && Number.isFinite(entry.size)
            ? Math.max(0, Math.floor(entry.size))
            : 0,
        storagePath,
        type:
          typeof entry.type === 'string'
            ? entry.type
            : 'application/octet-stream',
      };
    })
    .filter(
      (
        entry
      ): entry is {
        alias: string | null;
        name: string;
        size: number;
        storagePath: string;
        type: string;
      } => entry !== null
    );
}

async function fetchSignedReadUrlMap(
  paths: string[]
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();

  for (let index = 0; index < paths.length; index += 10) {
    const chunk = paths.slice(index, index + 10);
    const res = await fetch('/api/ai/chat/signed-read-url', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: chunk }),
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch signed read URLs (HTTP ${res.status})`);
    }

    const { urls: chunkUrls } = (await res.json()) as {
      urls: Array<{ path: string; signedUrl: string | null }>;
    };

    for (const item of chunkUrls) {
      if (item.signedUrl) {
        urls.set(item.path, item.signedUrl);
      }
    }
  }

  return urls;
}

export interface RestoredChatPayload {
  chat: Partial<AIChat>;
  messages: UIMessage[];
  messageAttachments: Map<string, MessageFileAttachment[]>;
}

function mergeAttachmentEntry(
  existing: MessageFileAttachment,
  incoming: MessageFileAttachment
): MessageFileAttachment {
  return {
    ...incoming,
    alias: incoming.alias ?? existing.alias ?? null,
    previewUrl: existing.previewUrl ?? incoming.previewUrl,
    signedUrl: incoming.signedUrl ?? existing.signedUrl,
    storagePath: incoming.storagePath ?? existing.storagePath,
    type:
      incoming.type === 'application/octet-stream' && existing.type
        ? existing.type
        : incoming.type,
  };
}

export function mergeMessageAttachmentMaps(
  existing: Map<string, MessageFileAttachment[]>,
  incoming: Map<string, MessageFileAttachment[]>
): Map<string, MessageFileAttachment[]> {
  if (existing.size === 0) {
    return new Map(incoming);
  }

  const merged = new Map(existing);

  for (const [messageId, attachments] of incoming.entries()) {
    const current = merged.get(messageId) ?? [];
    const attachmentsByPath = new Map<string, MessageFileAttachment>();

    for (const attachment of current) {
      attachmentsByPath.set(
        attachment.storagePath ?? attachment.id,
        attachment
      );
    }

    for (const attachment of attachments) {
      const key = attachment.storagePath ?? attachment.id;
      const existingAttachment = attachmentsByPath.get(key);
      attachmentsByPath.set(
        key,
        existingAttachment
          ? mergeAttachmentEntry(existingAttachment, attachment)
          : attachment
      );
    }

    merged.set(messageId, [...attachmentsByPath.values()]);
  }

  return merged;
}

export function findMatchingMessageIdForStoredFile({
  files,
  messages,
}: {
  files: Array<{
    path: string;
  }>;
  messages: Array<{
    id: string;
    metadata: unknown;
    role: string;
  }>;
}): Map<string, string> {
  const messageIdByStoragePath = new Map<string, string>();

  for (const message of messages) {
    for (const attachment of normalizeStoredAttachments(message.metadata)) {
      messageIdByStoragePath.set(attachment.storagePath, message.id);
    }
  }

  const resolved = new Map<string, string>();
  const userMessages = messages.filter(
    (message) => message.role.toLowerCase() === 'user'
  );
  const canUseSingleMessageLegacyFallback =
    userMessages.length === 1 && messageIdByStoragePath.size === 0;
  const fallbackMessageId = canUseSingleMessageLegacyFallback
    ? userMessages[0]?.id
    : undefined;

  for (const file of files) {
    const matchedMessageId =
      messageIdByStoragePath.get(file.path) ?? fallbackMessageId;
    if (matchedMessageId) {
      resolved.set(file.path, matchedMessageId);
    }
  }

  return resolved;
}

export function restoreMessages(
  messagesData: Array<{
    id: string;
    role: string;
    content: string | null;
    metadata: unknown;
  }>
): UIMessage[] {
  const normalizeRestoredRole = (role: string): 'assistant' | 'user' => {
    const normalized = role.toLowerCase();
    if (normalized === 'user') return 'user';
    return 'assistant';
  };

  return messagesData
    .filter((message) => {
      const metadata = message.metadata as Record<string, unknown> | null;
      return (
        message.content != null ||
        metadata?.toolCalls != null ||
        metadata?.reasoning != null ||
        metadata?.sources != null
      );
    })
    .map((message) => {
      const parts: UIMessage['parts'] = [];
      const metadata = message.metadata as Record<string, unknown> | null;
      const reasoning = metadata?.reasoning as string | undefined;
      const toolCalls = metadata?.toolCalls as
        | Array<{
            toolCallId: string;
            toolName: string;
            input?: unknown;
            args?: unknown;
          }>
        | undefined;
      const toolResults = metadata?.toolResults as
        | Array<{
            toolCallId: string;
            output?: unknown;
            result?: unknown;
          }>
        | undefined;
      const sources = metadata?.sources as
        | Array<{
            sourceId: string;
            url: string;
            title?: string;
          }>
        | undefined;

      if (reasoning) {
        parts.push({
          type: 'reasoning',
          text: reasoning,
        } as UIMessage['parts'][number]);
      }

      if (message.content) {
        parts.push({
          type: 'text',
          text: message.content,
        } as UIMessage['parts'][number]);
      }

      if (Array.isArray(toolCalls)) {
        for (const toolCall of toolCalls) {
          const toolResult = toolResults?.find(
            (result) => result.toolCallId === toolCall.toolCallId
          );

          parts.push({
            type: 'dynamic-tool',
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: 'output-available',
            input: toolCall.input ?? toolCall.args ?? {},
            output: toolResult?.output ?? toolResult?.result ?? null,
          } as UIMessage['parts'][number]);
        }
      }

      if (Array.isArray(sources)) {
        for (const source of sources) {
          parts.push({
            type: 'source-url',
            sourceId: source.sourceId,
            url: source.url,
            ...(source.title ? { title: source.title } : {}),
          } as UIMessage['parts'][number]);
        }
      }

      return {
        id: message.id,
        role: normalizeRestoredRole(message.role),
        parts,
        ...(metadata ? { metadata } : {}),
      };
    });
}

export async function loadExistingChat({
  wsId,
  storedChatId,
}: {
  wsId: string;
  storedChatId: string;
}): Promise<RestoredChatPayload | null> {
  const supabase = await createClient();
  const { data: chatData, error: chatError } = await supabase
    .from('ai_chats')
    .select('id, title, model, is_public')
    .eq('id', storedChatId)
    .maybeSingle();

  if (chatError) {
    console.error(
      '[Mira Chat] Error fetching ai_chats:',
      chatError,
      'storedChatId:',
      storedChatId
    );
    return null;
  }
  if (!chatData) return null;

  const { data: messagesData, error: messagesError } = await supabase
    .from('ai_chat_messages')
    .select('id, role, content, metadata')
    .eq('chat_id', storedChatId)
    .order('created_at', { ascending: true });

  if (messagesError) {
    console.error(
      '[Mira Chat] Error fetching ai_chat_messages:',
      messagesError,
      'storedChatId:',
      storedChatId
    );
    return null;
  }

  const restoredMessages = messagesData?.length
    ? restoreMessages(messagesData)
    : [];
  const messageAttachments = new Map<string, MessageFileAttachment[]>();
  const attachmentEntries = restoredMessages.flatMap((message) =>
    normalizeStoredAttachments(message.metadata).map((attachment, index) => ({
      attachment,
      index,
      messageId: message.id,
    }))
  );

  try {
    if (attachmentEntries.length > 0) {
      const signedUrlMap = await fetchSignedReadUrlMap(
        attachmentEntries.map(({ attachment }) => attachment.storagePath)
      );

      for (const { attachment, index, messageId } of attachmentEntries) {
        const existing = messageAttachments.get(messageId) || [];
        existing.push({
          alias: attachment.alias,
          id: `stored-${attachment.storagePath.replace(/[^a-zA-Z0-9]/g, '-')}-${index}`,
          name: attachment.name,
          previewUrl: null,
          signedUrl: signedUrlMap.get(attachment.storagePath) ?? null,
          size: attachment.size,
          storagePath: attachment.storagePath,
          type: attachment.type,
        });
        messageAttachments.set(messageId, existing);
      }
    }
  } catch (err) {
    console.error('[Mira Chat] Failed to load signed chat file URLs', err);
  }

  try {
    const fileUrlsRes = await fetch('/api/ai/chat/file-urls', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wsId, chatId: chatData.id }),
      cache: 'no-store',
    });

    if (fileUrlsRes.ok) {
      const { files } = (await fileUrlsRes.json()) as {
        files: Array<{
          path: string;
          name: string;
          size: number;
          type: string;
          signedUrl: string | null;
        }>;
      };

      if (files.length > 0) {
        const messageIdByStoragePath = findMatchingMessageIdForStoredFile({
          files,
          messages: messagesData ?? [],
        });

        files.forEach((file, index) => {
          const targetMsgId = messageIdByStoragePath.get(file.path);
          if (!targetMsgId) return;

          const existing = messageAttachments.get(targetMsgId) || [];
          const alreadyPresent = existing.some(
            (attachment) => attachment.storagePath === file.path
          );
          if (alreadyPresent) return;

          existing.push({
            alias: null,
            id: `stored-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}-${index}`,
            name: file.name,
            size: file.size,
            type: file.type,
            previewUrl: null,
            storagePath: file.path,
            signedUrl: file.signedUrl,
          });
          messageAttachments.set(targetMsgId, existing);
        });
      }
    }
  } catch (err) {
    console.error('[Mira Chat] Failed to load chat file URLs', err);
  }

  return {
    chat: chatData,
    messages: restoredMessages,
    messageAttachments,
  };
}
