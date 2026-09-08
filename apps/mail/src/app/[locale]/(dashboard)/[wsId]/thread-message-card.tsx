'use client';

import { ChevronDown, Paperclip } from '@tuturuuu/icons';
import type { MailAttachment, MailMessageDetail } from '@tuturuuu/internal-api';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { MailMessagePreview } from './mail-message-preview';

function formatDate(value: string | null, locale: string) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ThreadMessageCard({ message }: { message: MailMessageDetail }) {
  const t = useTranslations('mail');
  const locale = useLocale();
  const displayName = message.fromName || message.fromAddress;

  return (
    <AccordionItem
      className="min-w-0 max-w-full overflow-hidden rounded-2xl border-0 bg-background shadow-foreground/5 shadow-sm transition-shadow data-[state=open]:shadow-foreground/8 data-[state=open]:shadow-md"
      value={message.id}
    >
      <AccordionTrigger
        className="group px-4 py-4 hover:no-underline md:px-6"
        showChevron
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 flex-1 basis-40 truncate font-semibold">
              {displayName}
              {message.fromName ? (
                <span className="mt-0.5 block truncate font-normal text-muted-foreground text-xs">
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
              {formatDate(message.receivedAt ?? message.sentAt, locale)}
            </span>
          </div>
          <div className="mt-0.5 truncate text-muted-foreground text-xs group-data-[state=open]:hidden">
            {message.snippet || message.bodyText}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="p-0 pb-0">
        <div className="px-4 pb-3 md:px-6">
          <details className="group text-sm">
            <summary
              aria-label={t('message_details')}
              className="flex max-w-full cursor-pointer list-none items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
            >
              <span className="truncate">
                {t('to')}: {formatRecipients(message, 'to')}
              </span>
              <ChevronDown className="size-3 shrink-0 transition-transform group-open:rotate-180" />
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
              {Object.entries(message.safeHeaders)
                .filter(
                  ([key]) =>
                    !['from', 'to', 'cc', 'bcc', 'subject'].includes(
                      key.toLowerCase()
                    )
                )
                .map(([key, value]) => (
                  <Detail key={key} label={key} value={value} />
                ))}
            </dl>
          </details>
        </div>
        <div className="min-w-0 max-w-full overflow-hidden">
          {message.sanitizedHtml ? (
            <MailMessagePreview
              content={message.bodyHtml ?? message.sanitizedHtml}
              attachments={message.attachments}
              darkLabel={t('dark_view')}
              originalLabel={t('original_view')}
              title={message.subject || t('no_subject')}
              viewLabel={t('message_appearance')}
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words px-4 pb-6 font-sans text-sm leading-7 md:px-6">
              {message.bodyText}
            </pre>
          )}
          {message.attachments.length > 0 ? (
            <div className="grid gap-2 p-4 sm:grid-cols-2 md:px-6">
              {message.attachments.map((attachment) => (
                <AttachmentLink attachment={attachment} key={attachment.id} />
              ))}
            </div>
          ) : null}
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
    'flex items-center gap-2 rounded-xl bg-foreground/[0.045] p-3 text-sm',
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
