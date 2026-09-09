'use client';

import { ArrowRight, ChevronDown } from '@tuturuuu/icons';
import type { MailMessageDetail } from '@tuturuuu/internal-api';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useLocale, useTranslations } from 'next-intl';
import { MailAttachmentCard } from './mail-attachment-card';
import type { MailFolder } from './mail-folders';
import {
  formatMailRecipients,
  formatMailSender,
} from './mail-message-addresses';
import { MailMessagePreview } from './mail-message-preview';
import { visibleMailLabels } from './mail-visible-labels';

function formatDate(value: string | null, locale: string) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ThreadMessageCard({
  message,
  folder,
}: {
  message: MailMessageDetail;
  folder?: MailFolder;
}) {
  const t = useTranslations('mail');
  const locale = useLocale();
  const sender = formatMailSender(message);
  const recipient = formatMailRecipients(message, 'to');

  return (
    <AccordionItem
      className="min-w-0 max-w-full overflow-hidden rounded-2xl border-0 bg-background shadow-foreground/5 shadow-sm transition-shadow data-[state=open]:shadow-foreground/8 data-[state=open]:shadow-md"
      value={message.id}
    >
      <AccordionTrigger
        className="group min-w-0 max-w-full overflow-hidden px-4 py-4 hover:no-underline md:px-6"
        showChevron
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex min-w-0 flex-1 basis-60 items-center gap-2 text-left">
              <Address value={sender} />
              {recipient ? (
                <>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <Address value={recipient} muted />
                </>
              ) : null}
            </span>
            {message.deliveryRoute === 'catch_all' ? (
              <Badge variant="outline">{t('catch_all')}</Badge>
            ) : null}
            {visibleMailLabels(message.labels, folder).map((label) => (
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
          <div className="mt-1 line-clamp-2 whitespace-normal break-words text-muted-foreground text-xs group-data-[state=open]:hidden">
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
                {t('to')}: {formatMailRecipients(message, 'to')}
              </span>
              <ChevronDown className="size-3 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <dl className="mt-3 grid gap-2 rounded-xl bg-foreground/[0.035] p-3 text-xs">
              <Detail label={t('from')} value={sender} />
              <Detail
                label={t('to')}
                value={formatMailRecipients(message, 'to')}
              />
              <Detail
                label={t('cc')}
                value={formatMailRecipients(message, 'cc')}
              />
              <Detail
                label={t('bcc')}
                value={formatMailRecipients(message, 'bcc')}
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
              title={message.subject || t('no_subject')}
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words px-4 pb-6 font-sans text-sm leading-7 md:px-6">
              {message.bodyText}
            </pre>
          )}
          {message.attachments.length > 0 ? (
            <div className="grid gap-2 p-4 sm:grid-cols-2 md:px-6">
              {message.attachments.map((attachment) => (
                <MailAttachmentCard
                  attachment={attachment}
                  key={attachment.id}
                />
              ))}
            </div>
          ) : null}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function Address({ value, muted = false }: { value: string; muted?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`line-clamp-2 min-w-0 flex-1 break-all ${muted ? 'font-normal text-muted-foreground text-xs' : 'font-semibold'}`}
        >
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm break-all">{value}</TooltipContent>
    </Tooltip>
  );
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
