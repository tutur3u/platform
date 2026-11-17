'use client';

import { ChevronDown } from '@tuturuuu/icons';
import type { MailMessageDetail } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { type KeyboardEvent, type ReactNode, useId, useState } from 'react';
import { MailEmailText } from './mail-email-text';
import {
  MessageDetailRow,
  MessageIdValue,
  MessagePersonRow,
} from './message-detail-row';
import {
  formatMailDetailDate,
  type MessageDeliveryRow,
  type MessageTechnicalHeader,
  messageDeliveryDetails,
  messagePeopleGroups,
} from './message-details-model';
import { useMailTimeZone } from './use-mail-time-zone';

/** People and delivery details expanded inside the message header. */
export function MessageDetailsPanel({
  id,
  message,
  workspaceId,
  onClose,
}: {
  id: string;
  message: MailMessageDetail;
  workspaceId?: string;
  onClose: () => void;
}) {
  const t = useTranslations('mail.message_details_panel');
  const people = messagePeopleGroups(message);
  const delivery = messageDeliveryDetails(message);

  function closeOnEscape(event: KeyboardEvent<HTMLDivElement>) {
    // Keys from portalled profile cards bubble here through React; only
    // keys pressed inside the region itself collapse it.
    if (
      event.key !== 'Escape' ||
      event.defaultPrevented ||
      !event.currentTarget.contains(event.target as Node)
    )
      return;
    event.preventDefault();
    onClose();
  }

  return (
    <div
      id={id}
      role="region"
      aria-label={t('title')}
      onKeyDown={closeOnEscape}
      className="mt-3 grid gap-x-8 gap-y-4 border-t pt-3 lg:grid-cols-2"
    >
      <Section title={t('people')}>
        {people.map((group) => (
          <MessageDetailRow key={group.key} label={t(group.key)}>
            {group.people.map((person) => (
              <MessagePersonRow
                key={person.address.toLowerCase()}
                workspaceId={workspaceId}
                person={person}
              />
            ))}
          </MessageDetailRow>
        ))}
      </Section>
      {delivery.rows.length || delivery.technical.length ? (
        <Section
          title={t('delivery')}
          footer={
            delivery.technical.length ? (
              <TechnicalHeaders headers={delivery.technical} />
            ) : null
          }
        >
          {delivery.rows.map((row) => (
            <DeliveryRow
              key={deliveryRowKey(row)}
              row={row}
              workspaceId={workspaceId}
            />
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function deliveryRowKey(row: MessageDeliveryRow) {
  return row.kind === 'text' ? row.header : row.key;
}

function Section({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <h3 className="mb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      <dl>{children}</dl>
      {footer}
    </section>
  );
}

/** Raw headers, collapsed in the flow of the Delivery section. */
function TechnicalHeaders({
  headers,
}: {
  headers: readonly MessageTechnicalHeader[];
}) {
  const t = useTranslations('mail.message_details_panel');
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
        className="-mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-medium text-muted-foreground text-xs outline-ring/50 transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-2"
      >
        {t('technical_headers')}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-3.5 transition-transform motion-reduce:transition-none',
            open && 'rotate-180'
          )}
        />
      </button>
      {open ? (
        <dl id={id} className="mt-1 border-l pl-3">
          {headers.map((header) => (
            <MessageDetailRow
              key={header.header}
              label={header.header}
              rawLabel
            >
              <p className="break-all pt-0.5 font-mono text-muted-foreground text-xs">
                {header.value}
              </p>
            </MessageDetailRow>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function DeliveryRow({
  row,
  workspaceId,
}: {
  row: MessageDeliveryRow;
  workspaceId?: string;
}) {
  const t = useTranslations('mail.message_details_panel');
  const locale = useLocale();
  const timeZone = useMailTimeZone();
  switch (row.kind) {
    case 'date':
      return (
        <MessageDetailRow label={t(row.key)}>
          <p className="pt-0.5 text-sm">
            <time dateTime={row.iso}>
              {formatMailDetailDate(row.iso, locale, timeZone)}
            </time>
          </p>
        </MessageDetailRow>
      );
    case 'id':
      return (
        <MessageDetailRow label={t(row.key)}>
          <MessageIdValue value={row.value} />
        </MessageDetailRow>
      );
    case 'person':
      return (
        <MessageDetailRow label={t(row.key)}>
          <MessagePersonRow workspaceId={workspaceId} person={row.person} />
        </MessageDetailRow>
      );
    case 'text':
      return (
        <MessageDetailRow label={t(row.label)}>
          <p className="break-all pt-0.5 text-sm">
            <MailEmailText text={row.value} />
          </p>
        </MessageDetailRow>
      );
  }
}
