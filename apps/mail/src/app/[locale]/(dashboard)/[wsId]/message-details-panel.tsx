'use client';

import type { MailMessageDetail } from '@tuturuuu/internal-api';
import { useLocale, useTranslations } from 'next-intl';
import type { KeyboardEvent, ReactNode } from 'react';
import { MailEmailText } from './mail-email-text';
import {
  MessageDetailRow,
  MessageIdValue,
  MessagePersonRow,
} from './message-detail-row';
import {
  formatMailDetailDate,
  type MessageDeliveryRow,
  messageDeliveryRows,
  messagePeopleGroups,
} from './message-details-model';

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
  const delivery = messageDeliveryRows(message);

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
      {delivery.length ? (
        <Section title={t('delivery')}>
          {delivery.map((row) => (
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
  if (row.kind === 'text') return row.header;
  return row.kind === 'date' ? 'date' : row.key;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      <dl>{children}</dl>
    </section>
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
  switch (row.kind) {
    case 'date': {
      const local = formatMailDetailDate(row.iso, locale);
      return (
        <MessageDetailRow label={t('date')}>
          {local ? <p className="pt-0.5 text-sm">{local}</p> : null}
          {row.raw ? (
            <p className="break-all font-mono text-muted-foreground text-xs">
              {row.raw}
            </p>
          ) : null}
        </MessageDetailRow>
      );
    }
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
      return row.label ? (
        <MessageDetailRow label={t(row.label)}>
          <p className="break-all pt-0.5 text-sm">
            <MailEmailText text={row.value} />
          </p>
        </MessageDetailRow>
      ) : (
        <MessageDetailRow label={row.header} rawLabel>
          <p className="break-all pt-0.5 font-mono text-muted-foreground text-xs">
            {row.value}
          </p>
        </MessageDetailRow>
      );
  }
}
