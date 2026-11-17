'use client';

import type { MailMessageDetail } from '@tuturuuu/internal-api';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { getFailedMailRecipients } from '@/lib/mail/failed-recipients';
import { MailAttachmentCard } from './mail-attachment-card';
import { MailBlacklistControl } from './mail-blacklist-control';
import type { MailFolder } from './mail-folders';
import { MailInvitationCard } from './mail-invitation-card';
import { MailLabelBadges } from './mail-label-badges';
import { MailMessagePreview } from './mail-message-preview';
import { MailMessageSourceMenu } from './mail-message-source-menu';
import { MailPlainTextBody } from './mail-plain-text-body';
import { mailSnippetText } from './mail-snippet-text';
import { visibleMailLabels } from './mail-visible-labels';
import { MessageDetailsPanel } from './message-details-panel';
import { MessageHeaderPeople } from './message-header-people';

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
  workspaceId,
}: {
  message: MailMessageDetail;
  folder?: MailFolder;
  workspaceId?: string;
}) {
  const t = useTranslations('mail');
  const locale = useLocale();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const detailsToggle = useRef<HTMLButtonElement>(null);

  return (
    <AccordionItem
      className="group/message min-w-0 max-w-full overflow-hidden rounded-2xl border-0 bg-background shadow-foreground/5 shadow-sm transition-shadow data-[state=open]:shadow-foreground/8 data-[state=open]:shadow-md"
      value={message.id}
    >
      <div className="px-4 py-3 md:px-5 md:py-4">
        <div className="flex min-w-0 items-center gap-2">
          <MessageHeaderPeople
            message={message}
            workspaceId={workspaceId}
            detailsOpen={detailsOpen}
            detailsId={detailsId}
            toggleRef={detailsToggle}
            onToggleDetails={() => setDetailsOpen((current) => !current)}
          />
          <div className="flex max-w-[30%] shrink-0 flex-wrap items-center justify-end gap-1 empty:hidden">
            {message.deliveryRoute === 'catch_all' ? (
              <Badge className="px-1.5 py-0 text-[10px]" variant="outline">
                {t('catch_all')}
              </Badge>
            ) : null}
            <MailLabelBadges
              labels={visibleMailLabels(message.labels, folder)}
            />
          </div>
          <time
            dateTime={message.receivedAt ?? message.sentAt ?? undefined}
            className="hidden shrink-0 font-mono text-muted-foreground text-xs tabular-nums sm:block"
          >
            {formatDate(message.receivedAt ?? message.sentAt, locale)}
          </time>
          {workspaceId ? (
            <MailMessageSourceMenu
              key={message.id}
              workspaceId={workspaceId}
              mailboxId={message.mailboxId}
              messageId={message.id}
            />
          ) : null}
          <AccordionTrigger
            aria-label={message.subject || t('no_subject')}
            className="shrink-0 items-center p-1 hover:bg-muted/50 hover:no-underline"
          />
        </div>
        <div className="mt-1 line-clamp-2 whitespace-normal break-words text-muted-foreground text-xs group-data-[state=open]/message:hidden">
          {mailSnippetText(message.snippet || message.bodyText || '')}
        </div>
        {detailsOpen ? (
          <MessageDetailsPanel
            id={detailsId}
            message={message}
            workspaceId={workspaceId}
            onClose={() => {
              setDetailsOpen(false);
              detailsToggle.current?.focus();
            }}
          />
        ) : null}
      </div>
      <AccordionContent className="p-0 pb-0">
        {workspaceId && message.direction === 'inbound' ? (
          <MailInvitationCard
            key={`${workspaceId}:${message.mailboxId}:${message.id}`}
            workspaceId={workspaceId}
            mailboxId={message.mailboxId}
            messageId={message.id}
          />
        ) : null}
        {workspaceId && getFailedMailRecipients(message).length > 0 ? (
          <MailBlacklistControl
            key={message.id}
            workspaceId={workspaceId}
            mailboxId={message.mailboxId}
            messageId={message.id}
          />
        ) : null}
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
