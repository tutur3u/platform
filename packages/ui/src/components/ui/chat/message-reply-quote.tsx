'use client';

import type { ChatMessage } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { getChatMessageDisplayContent } from './external-message-content';
import { getChatMessageSenderLabel } from './utils';

export function MessageReplyQuote({
  message,
  onJump,
}: {
  message: ChatMessage | undefined;
  onJump: () => void;
}) {
  const t = useTranslations('chat');

  if (!message) {
    return (
      <p className="border-s-2 ps-2 text-muted-foreground text-xs">
        {t('original_message_unavailable')}
      </p>
    );
  }

  const sender = getChatMessageSenderLabel(message, {
    assistant: t('assistant_name'),
    external: t('external_sender'),
    unknown: t('unknown_sender'),
  });
  const preview = message.deletedAt
    ? t('message_deleted')
    : getChatMessageDisplayContent(message).trim() ||
      (message.attachments.length ? t('attachment') : '');

  return (
    <button
      className="block w-fit max-w-full rounded-sm border-s-2 bg-muted/40 px-2 py-1 text-start text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      onClick={onJump}
      type="button"
    >
      <span className="sr-only">{t('jump_to_original_message')} </span>
      <span className="block truncate font-medium">{sender}</span>
      {preview && (
        <span className="block truncate text-muted-foreground">{preview}</span>
      )}
    </button>
  );
}
