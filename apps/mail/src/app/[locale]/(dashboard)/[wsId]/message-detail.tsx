'use client';

import {
  Archive,
  MailOpen,
  Paperclip,
  Reply,
  Star,
  Trash2,
} from '@tuturuuu/icons';
import type { MailMessageDetail } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';

interface MessageDetailProps {
  loading: boolean;
  message: MailMessageDetail | null;
  onArchive: () => void;
  onMarkRead: () => void;
  onStar: () => void;
  onTrash: () => void;
}

function formatDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function MessageDetail({
  loading,
  message,
  onArchive,
  onMarkRead,
  onStar,
  onTrash,
}: MessageDetailProps) {
  const t = useTranslations('mail');

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        {t('loading_message')}
      </div>
    );
  }

  if (!message) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        {t('select_message')}
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="border-dynamic border-b px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h1 className="min-w-0 truncate font-semibold text-xl">
            {message.subject}
          </h1>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="icon" variant="ghost" onClick={onMarkRead}>
              <MailOpen className="h-4 w-4" />
              <span className="sr-only">{t('mark_read')}</span>
            </Button>
            <Button size="icon" variant="ghost" onClick={onStar}>
              <Star className="h-4 w-4" />
              <span className="sr-only">{t('star')}</span>
            </Button>
            <Button size="icon" variant="ghost" onClick={onArchive}>
              <Archive className="h-4 w-4" />
              <span className="sr-only">{t('archive')}</span>
            </Button>
            <Button size="icon" variant="ghost" onClick={onTrash}>
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">{t('trash')}</span>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
          <span className="font-medium text-foreground">
            {message.fromName || message.fromAddress}
          </span>
          <span>{message.fromAddress}</span>
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
        <div className="space-y-5 p-5">
          {message.recipients.length > 0 ? (
            <div className="rounded-lg border border-dynamic bg-foreground/5 p-3 text-sm">
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
              className="min-h-96 w-full rounded-lg border border-dynamic bg-background"
              sandbox=""
              srcDoc={message.sanitizedHtml}
              title={message.subject}
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
                  <a
                    key={attachment.id}
                    className="flex items-center gap-2 rounded-lg border border-dynamic p-3 text-sm hover:bg-foreground/5"
                    href={attachment.protectedUrl ?? undefined}
                  >
                    <Paperclip className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate">
                      {attachment.filename}
                    </span>
                    <span className="text-muted-foreground">
                      {Math.ceil(attachment.sizeBytes / 1024)} KB
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>
      <div className="border-dynamic border-t p-4">
        <Button variant="secondary">
          <Reply className="h-4 w-4" />
          {t('reply')}
        </Button>
      </div>
    </div>
  );
}
