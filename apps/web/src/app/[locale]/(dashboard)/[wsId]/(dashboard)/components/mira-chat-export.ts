'use client';

import type { AIChat } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import type { MessageFileAttachment } from './file-preview-chips';

export function exportMiraChat({
  chat,
  chatId,
  fallbackChatId,
  messageAttachments,
  messages,
  model,
  status,
  t,
  thinkingMode,
  wsId,
}: {
  chat: Partial<AIChat> | null | undefined;
  chatId: string;
  fallbackChatId: string;
  messageAttachments: Map<string, MessageFileAttachment[]>;
  messages: any[];
  model: any;
  status: string;
  t: (...args: any[]) => string;
  thinkingMode: string;
  wsId: string;
}) {
  if (messages.length === 0) return;

  try {
    const timestamp = new Date().toISOString();
    const payload = {
      exportedAt: timestamp,
      wsId,
      chatId,
      fallbackChatId,
      status,
      model,
      thinkingMode,
      chat: chat ?? null,
      messages,
      messageAttachments: Object.fromEntries(messageAttachments.entries()),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    let appended = false;

    try {
      const safeWs = wsId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeChat = (chatId ?? fallbackChatId).replace(
        /[^a-zA-Z0-9_-]/g,
        '_'
      );
      const safeTimestamp = timestamp.replace(/[:.]/g, '-');

      anchor.href = url;
      anchor.download = `mira-chat-${safeWs}-${safeChat}-${safeTimestamp}.json`;
      document.body.appendChild(anchor);
      appended = true;
      anchor.click();
      toast.success(t('export_chat_success'));
    } finally {
      if (appended && document.body.contains(anchor)) {
        document.body.removeChild(anchor);
      }
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('[Mira Chat] Failed to export chat:', error);
    toast.error(t('export_chat_failed'));
  }
}
