'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { AIChat } from '@tuturuuu/types';
import type { MessageFileAttachment } from './file-preview-chips';

export interface RestoredChatPayload {
  chat: Partial<AIChat>;
  messages: UIMessage[];
  messageAttachments: Map<string, MessageFileAttachment[]>;
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
        const firstUserMessage = messagesData?.find(
          (message) => message.role.toLowerCase() === 'user'
        );

        files.forEach((file, index) => {
          let targetMsgId = (file as any).message_id;

          if (!targetMsgId) {
            const msgMatch = messagesData?.find((m) => {
              const meta = m.metadata as any;
              return (
                meta &&
                Array.isArray(meta.attachments) &&
                meta.attachments.some(
                  (a: any) =>
                    a.storagePath === file.path ||
                    a.url === file.path ||
                    a.id === file.path
                )
              );
            });
            targetMsgId = msgMatch?.id || firstUserMessage?.id;
          }

          if (targetMsgId) {
            const existing = messageAttachments.get(targetMsgId) || [];
            existing.push({
              id: `stored-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}-${index}`,
              name: file.name,
              size: file.size,
              type: file.type,
              previewUrl: null,
              storagePath: file.path,
              signedUrl: file.signedUrl,
            });
            messageAttachments.set(targetMsgId, existing);
          }
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
