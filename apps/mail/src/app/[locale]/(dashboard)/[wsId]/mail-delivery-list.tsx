'use client';

import type { MailThreadSummary } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { MailDeliveryDisclosure } from './mail-delivery-disclosure';
import { groupMailDeliveries } from './mail-delivery-groups';
import type { MailFolder } from './mail-folders';
import { MailThreadRow } from './mail-thread-list';

export function MailDeliveryList({
  threads,
  folder,
  threadId,
  selectedThreads,
  onOpen,
  onPrefetch,
  onSelect,
}: {
  threads: MailThreadSummary[];
  folder: MailFolder;
  threadId: string | null;
  selectedThreads: Set<string>;
  onOpen: (thread: MailThreadSummary) => void;
  onPrefetch: (id: string) => void;
  onSelect: (id: string, selected: boolean) => void;
}) {
  const t = useTranslations('mail');
  const row = (thread: MailThreadSummary) => (
    <MailThreadRow
      key={thread.id}
      folder={folder}
      active={thread.id === threadId}
      onClick={() => onOpen(thread)}
      onPrefetch={() => onPrefetch(thread.id)}
      onSelect={(selected) => onSelect(thread.id, selected)}
      selected={selectedThreads.has(thread.id)}
      thread={thread}
    />
  );
  return groupMailDeliveries(threads).map((group) => {
    const first = group[0]!;
    if (group.length === 1) return row(first);
    const others = group.slice(1);
    const unread = group.filter((thread) => thread.unreadCount > 0).length;
    return (
      <div key={first.id} className="rounded-xl bg-muted/25">
        {row(first)}
        <MailDeliveryDisclosure
          reveal={others.some(
            (thread) => thread.id === threadId || selectedThreads.has(thread.id)
          )}
        >
          <summary className="cursor-pointer rounded-md px-4 py-2 text-muted-foreground text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t('similar_deliveries', { count: group.length })}
            {unread > 0 ? (
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-semibold text-foreground">
                {t('delivery_unread_count', { count: unread })}
              </span>
            ) : null}
            <span className="ml-2 font-medium text-foreground">
              {t('show_recipients')}
            </span>
          </summary>
          <p className="px-4 pb-2 text-muted-foreground text-xs">
            {t('similar_deliveries_description')}
          </p>
          <div className="space-y-1 border-dynamic border-l-2 pl-2">
            {others.map(row)}
          </div>
        </MailDeliveryDisclosure>
      </div>
    );
  });
}
