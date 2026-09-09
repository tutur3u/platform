'use client';

import { ArrowRight, ChevronDown } from '@tuturuuu/icons';
import type { MailMessageDetail } from '@tuturuuu/internal-api';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useLocale, useTranslations } from 'next-intl';
import { MailAttachmentCard } from './mail-attachment-card';
import type { MailFolder } from './mail-folders';
import {
  formatMailRecipients,
  formatMailSender,
} from './mail-message-addresses';
import { MailMessagePreview } from './mail-message-preview';
import { MailPlainTextBody } from './mail-plain-text-body';
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
      className="group/message min-w-0 max-w-full overflow-hidden rounded-2xl border-0 bg-background shadow-foreground/5 shadow-sm transition-shadow data-[state=open]:shadow-foreground/8 data-[state=open]:shadow-md"
      value={message.id}
    >
      <div className="px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`${t('message_details')}: ${sender}${recipient ? ` → ${recipient}` : ''}`}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left outline-ring/50 transition-colors hover:bg-muted/50 focus-visible:outline-2"
              >
                <Address
                  value={sender}
                  label={message.fromName?.trim() || message.fromAddress}
                />
                {recipient ? (
                  <>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-3 shrink-0 text-muted-foreground"
                    />
                    <Address value={recipient} muted />
                  </>
                ) : null}
                <ChevronDown
                  aria-hidden="true"
                  className="size-3 shrink-0 text-muted-foreground"
                />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              aria-label={t('message_details')}
              className="max-h-[min(28rem,var(--radix-popover-content-available-height))] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto rounded-xl"
            >
              <dl className="grid gap-2 text-xs">
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
            </PopoverContent>
          </Popover>
          <div className="flex max-w-[30%] shrink-0 flex-wrap items-center justify-end gap-1 empty:hidden">
            {message.deliveryRoute === 'catch_all' ? (
              <Badge className="px-1.5 py-0 text-[10px]" variant="outline">
                {t('catch_all')}
              </Badge>
            ) : null}
            {visibleMailLabels(message.labels, folder).map((label) => (
              <Badge
                className="max-w-40 gap-1 px-1.5 py-0 text-[10px]"
                key={label.id}
                variant="secondary"
              >
                <span
                  className="size-1 shrink-0 rounded-full bg-foreground/30"
                  style={
                    label.color ? { backgroundColor: label.color } : undefined
                  }
                />
                <span className="truncate">{label.name}</span>
              </Badge>
            ))}
          </div>
          <span className="hidden shrink-0 text-muted-foreground text-xs sm:block">
            {formatDate(message.receivedAt ?? message.sentAt, locale)}
          </span>
          <AccordionTrigger
            aria-label={message.subject || t('no_subject')}
            className="shrink-0 items-center p-1 hover:bg-muted/50 hover:no-underline"
          />
        </div>
        <div className="mt-1 line-clamp-2 whitespace-normal break-words text-muted-foreground text-xs group-data-[state=open]/message:hidden">
          {message.snippet || message.bodyText}
        </div>
      </div>
      <AccordionContent className="p-0 pb-0">
        <div className="min-w-0 max-w-full overflow-hidden">
          {message.sanitizedHtml ? (
            <MailMessagePreview
              content={message.bodyHtml ?? message.sanitizedHtml}
              attachments={message.attachments}
              title={message.subject || t('no_subject')}
            />
          ) : (
            <MailPlainTextBody content={message.bodyText ?? ''} />
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

function Address({
  value,
  label = value,
  muted = false,
}: {
  value: string;
  label?: string;
  muted?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`min-w-0 truncate ${muted ? 'shrink font-normal text-muted-foreground text-xs' : 'shrink font-semibold text-sm'}`}
        >
          {label}
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
