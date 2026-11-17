'use client';

import { ArrowRight, ChevronDown } from '@tuturuuu/icons';
import type { MailMessageDetail } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Fragment, type Ref } from 'react';
import { collapseMailRecipients } from './mail-person-display';
import { MailSenderContactCard } from './mail-sender-contact-card';
import { messageHeaderRecipients } from './message-details-model';

/** "Sender → A, B +N" with each name opening its profile card. */
export function MessageHeaderPeople({
  message,
  workspaceId,
  detailsOpen,
  detailsId,
  toggleRef,
  onToggleDetails,
}: {
  message: MailMessageDetail;
  workspaceId?: string;
  detailsOpen: boolean;
  detailsId: string;
  toggleRef: Ref<HTMLButtonElement>;
  onToggleDetails: () => void;
}) {
  const t = useTranslations('mail.message_details_panel');
  const recipients = messageHeaderRecipients(message);
  const { visible, hidden } = collapseMailRecipients(recipients);

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1">
      <MailSenderContactCard
        workspaceId={workspaceId}
        address={message.fromAddress}
        name={message.fromName}
      />
      {recipients.length ? (
        <div className="flex min-w-0 items-center gap-1">
          <ArrowRight
            aria-hidden="true"
            className="size-3 shrink-0 text-muted-foreground"
          />
          <span className="sr-only">{t('to')}</span>
          {visible.map((recipient, index) => (
            <Fragment key={recipient.address.toLowerCase()}>
              {index > 0 ? (
                <span aria-hidden="true" className="text-muted-foreground">
                  ,
                </span>
              ) : null}
              <MailSenderContactCard
                workspaceId={workspaceId}
                address={recipient.address}
                name={recipient.name}
                variant="inline"
              />
            </Fragment>
          ))}
          {hidden > 0 ? (
            <button
              type="button"
              aria-label={t('more_recipients', { count: hidden })}
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              onClick={onToggleDetails}
              className="shrink-0 rounded-full bg-muted px-1.5 font-medium text-muted-foreground text-xs tabular-nums outline-ring/50 hover:bg-muted/70 focus-visible:outline-2"
            >
              +{hidden}
            </button>
          ) : null}
        </div>
      ) : null}
      <button
        ref={toggleRef}
        type="button"
        aria-label={detailsOpen ? t('hide') : t('show')}
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        onClick={onToggleDetails}
        className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-ring/50 transition-colors hover:bg-muted/60 focus-visible:outline-2"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-3.5 transition-transform motion-reduce:transition-none',
            detailsOpen && 'rotate-180'
          )}
        />
      </button>
    </div>
  );
}
