'use client';

import type { ChatMessage } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { getChatMessageDisplayContent } from './external-message-content';
import { getChatMessageSenderLabel } from './utils';

export function MessageReplyQuote({
  isSearching,
  message,
  onJump,
}: {
  isSearching?: boolean;
  message?: ChatMessage;
  onJump?: () => void;
}) {
  const t = useTranslations('chat');

  if (!onJump) {
    return (
      <p className="border-s-2 ps-2 text-muted-foreground text-xs">
        {t('original_message_unavailable')}
      </p>
    );
  }

  return (
    <button
      aria-busy={isSearching || undefined}
      className="block w-fit max-w-full rounded-sm border-s-2 bg-muted/40 px-2 py-1 text-start text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      onClick={onJump}
      type="button"
    >
      {message ? (
        <>
          <span className="sr-only">{t('jump_to_original_message')} </span>
          <MessageReplyPreview message={message} />
        </>
      ) : (
        <span className="text-muted-foreground">
          {t(
            isSearching ? 'loading_older_messages' : 'jump_to_original_message'
          )}
        </span>
      )}
    </button>
  );
}

export function MessageReplyPreview({
  draft,
  message,
}: {
  draft?: boolean;
  message?: ChatMessage;
}) {
  const t = useTranslations('chat');

  if (!message) {
    return (
      <span className="text-muted-foreground">
        {t('original_message_unavailable')}
      </span>
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
    <>
      <span className="block truncate font-medium">
        {draft ? t('replying_to', { sender }) : sender}
      </span>
      {preview && (
        <span className="block truncate text-muted-foreground">{preview}</span>
      )}
    </>
  );
}
