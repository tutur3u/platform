'use client';

import {
  Archive,
  ArrowLeft,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  Reply,
  Star,
  Trash2,
} from '@tuturuuu/icons';
import type { MailAttachment, MailMessageDetail } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

interface MessageDetailProps {
  actionPending: boolean;
  loading: boolean;
  message: MailMessageDetail | null;
  onArchive: () => void;
  onBack: () => void;
  onReply: (message: MailMessageDetail) => void;
  onStar: () => void;
  onToggleRead: () => void;
  onTrash: () => void;
  showBack: boolean;
}

function formatDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function MessageDetail({
  actionPending,
  loading,
  message,
  onArchive,
  onBack,
  onReply,
  onStar,
  onToggleRead,
  onTrash,
  showBack,
}: MessageDetailProps) {
  const t = useTranslations('mail');

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center text-muted-foreground text-sm">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t('loading_message')}
      </div>
    );
  }

  if (!message) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center px-8 text-center">
        <div className="max-w-sm space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-dynamic bg-foreground/5">
            <MailOpen className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h2 className="font-semibold text-base">{t('select_message')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('select_message_description')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-dynamic border-b px-4 py-3 md:px-5 md:py-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {showBack ? (
              <Button
                aria-label={t('back_to_messages')}
                className="mt-0.5 h-8 w-8 shrink-0 lg:hidden"
                onClick={onBack}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : null}
            <h1 className="min-w-0 flex-1 text-pretty font-semibold text-lg leading-tight md:text-xl">
              {message.subject || t('no_subject')}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              aria-label={message.unread ? t('mark_read') : t('mark_unread')}
              disabled={actionPending}
              onClick={onToggleRead}
              size="icon"
              type="button"
              variant="ghost"
            >
              {message.unread ? (
                <MailOpen className="h-4 w-4" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
            </Button>
            <Button
              aria-label={message.starred ? t('unstar') : t('star')}
              disabled={actionPending}
              onClick={onStar}
              size="icon"
              type="button"
              variant={message.starred ? 'secondary' : 'ghost'}
            >
              <Star className="h-4 w-4" />
            </Button>
            <Button
              aria-label={t('archive')}
              disabled={actionPending}
              onClick={onArchive}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Archive className="h-4 w-4" />
            </Button>
            <Button
              aria-label={t('trash')}
              disabled={actionPending}
              onClick={onTrash}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-sm">
          <span className="font-medium text-foreground">
            {message.fromName || message.fromAddress}
          </span>
          <span className="truncate">{message.fromAddress}</span>
          <span>{formatDate(message.receivedAt ?? message.sentAt)}</span>
        </div>
        {message.labels.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.labels.map((label) => (
              <Badge key={label.id} variant="secondary">
                {label.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4 md:p-5">
          {message.recipients.length > 0 ? (
            <div className="rounded-md border border-dynamic bg-foreground/5 p-3 text-sm">
              {message.recipients.map((recipient) => (
                <div key={`${recipient.kind}-${recipient.address}`}>
                  <span className="font-medium">{recipient.kind}</span>{' '}
                  {recipient.displayName || recipient.address}
                </div>
              ))}
            </div>
          ) : null}
          {message.sanitizedHtml ? (
            <iframe
              className="min-h-[520px] w-full rounded-md border border-dynamic bg-background"
              sandbox=""
              srcDoc={message.sanitizedHtml}
              title={message.subject || t('no_subject')}
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm leading-6">
              {message.bodyText}
            </pre>
          )}
          {message.attachments.length > 0 ? (
            <div className="space-y-2">
              <div className="font-medium text-sm">{t('attachments')}</div>
              <div className="grid gap-2">
                {message.attachments.map((attachment) => (
                  <AttachmentLink attachment={attachment} key={attachment.id} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>
      <div className="flex items-center gap-2 border-dynamic border-t p-3 md:p-4">
        <Button
          disabled={actionPending}
          onClick={() => onReply(message)}
          type="button"
          variant="secondary"
        >
          <Reply className="h-4 w-4" />
          {t('reply')}
        </Button>
        {actionPending ? (
          <span className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('updating')}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function AttachmentLink({ attachment }: { attachment: MailAttachment }) {
  const t = useTranslations('mail');
  const unavailable = !attachment.protectedUrl;
  const className = cn(
    'flex items-center gap-2 rounded-md border border-dynamic p-3 text-sm transition',
    unavailable
      ? 'cursor-not-allowed opacity-60'
      : 'hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  );
  const content = (
    <>
      <Paperclip className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
      <span className="text-muted-foreground">
        {Math.ceil(attachment.sizeBytes / 1024)} KB
      </span>
    </>
  );

  if (unavailable) {
    return (
      <div aria-disabled="true" className={className} title={t('unavailable')}>
        {content}
      </div>
    );
  }

  return (
    <a className={className} href={attachment.protectedUrl ?? undefined}>
      {content}
    </a>
  );
}
