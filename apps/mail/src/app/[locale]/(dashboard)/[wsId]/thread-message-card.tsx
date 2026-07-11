'use client';

import { Forward, Paperclip, Reply, ReplyAll } from '@tuturuuu/icons';
import type { MailAttachment, MailMessageDetail } from '@tuturuuu/internal-api';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { MailMessagePreview } from './mail-message-preview';

function formatDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ThreadMessageCard({
  message,
  onForward,
  onReply,
  onReplyAll,
}: {
  message: MailMessageDetail;
  onForward: (message: MailMessageDetail) => void;
  onReply: (message: MailMessageDetail) => void;
  onReplyAll: (message: MailMessageDetail) => void;
}) {
  const t = useTranslations('mail');
  const displayName = message.fromName || message.fromAddress;

  return (
    <AccordionItem
      className="overflow-hidden rounded-2xl border border-dynamic bg-background/90 shadow-sm"
      value={message.id}
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline" showChevron>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate font-semibold">
              {displayName}
              {message.fromName ? (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  &lt;{message.fromAddress}&gt;
                </span>
              ) : null}
            </span>
            {message.deliveryRoute === 'catch_all' ? (
              <Badge variant="outline">{t('catch_all')}</Badge>
            ) : null}
            {message.labels.map((label) => (
              <Badge className="gap-1.5" key={label.id} variant="secondary">
                <span
                  className="size-1.5 rounded-full bg-foreground/30"
                  style={
                    label.color ? { backgroundColor: label.color } : undefined
                  }
                />
                {label.name}
              </Badge>
            ))}
            <span className="ml-auto shrink-0 text-muted-foreground text-xs">
              {formatDate(message.receivedAt ?? message.sentAt)}
            </span>
          </div>
          <div className="mt-0.5 truncate text-muted-foreground text-xs">
            {message.snippet || message.bodyText}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="border-dynamic border-t p-0 pb-0">
        <div className="border-dynamic border-b px-4 py-3">
          <details className="group text-sm">
            <summary className="cursor-pointer list-none font-medium text-muted-foreground hover:text-foreground">
              {t('message_details')}
            </summary>
            <dl className="mt-3 grid gap-2 rounded-xl bg-foreground/[0.035] p-3 text-xs">
              <Detail
                label={t('from')}
                value={
                  message.fromName
                    ? `${message.fromName} <${message.fromAddress}>`
                    : message.fromAddress
                }
              />
              <Detail label={t('to')} value={formatRecipients(message, 'to')} />
              <Detail label={t('cc')} value={formatRecipients(message, 'cc')} />
              <Detail
                label={t('bcc')}
                value={formatRecipients(message, 'bcc')}
              />
              {message.observedRecipient ? (
                <Detail
                  label={t('original_recipient')}
                  value={message.observedRecipient}
                />
              ) : null}
              {Object.entries(message.safeHeaders).map(([key, value]) => (
                <Detail key={key} label={key} value={value} />
              ))}
            </dl>
          </details>
        </div>
        <div className="min-w-0 max-w-full overflow-hidden p-4">
          {message.sanitizedHtml ? (
            <MailMessagePreview
              content={message.sanitizedHtml}
              darkLabel={t('dark_view')}
              originalLabel={t('original_view')}
              title={message.subject || t('no_subject')}
              viewLabel={t('message_appearance')}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-6">
              {message.bodyText}
            </pre>
          )}
          {message.attachments.length > 0 ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {message.attachments.map((attachment) => (
                <AttachmentLink attachment={attachment} key={attachment.id} />
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 border-dynamic border-t px-4 py-3">
          <Button
            onClick={() => onReply(message)}
            size="sm"
            variant="secondary"
          >
            <Reply className="size-4" /> {t('reply')}
          </Button>
          <Button onClick={() => onReplyAll(message)} size="sm" variant="ghost">
            <ReplyAll className="size-4" /> {t('reply_all')}
          </Button>
          <Button onClick={() => onForward(message)} size="sm" variant="ghost">
            <Forward className="size-4" /> {t('forward')}
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function formatRecipients(
  message: MailMessageDetail,
  kind: 'bcc' | 'cc' | 'to'
) {
  return message.recipients
    .filter((recipient) => recipient.kind === kind)
    .map((recipient) =>
      recipient.displayName
        ? `${recipient.displayName} <${recipient.address}>`
        : recipient.address
    )
    .join(', ');
}

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all">{value}</dd>
    </div>
  );
}

function AttachmentLink({ attachment }: { attachment: MailAttachment }) {
  const unavailable = !attachment.protectedUrl;
  const content = (
    <>
      <Paperclip className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
      <span className="text-muted-foreground text-xs">
        {Math.ceil(attachment.sizeBytes / 1024)} KB
      </span>
    </>
  );
  const className = cn(
    'flex items-center gap-2 rounded-xl border border-dynamic p-3 text-sm',
    !unavailable && 'transition hover:bg-foreground/5'
  );
  return unavailable ? (
    <div aria-disabled className={cn(className, 'opacity-60')}>
      {content}
    </div>
  ) : (
    <a className={className} href={attachment.protectedUrl ?? undefined}>
      {content}
    </a>
  );
}
