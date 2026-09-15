'use client';

import { ChevronRight } from '@tuturuuu/icons';
import type { MailThreadSummary } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { MailDeliveryDisclosure } from './mail-delivery-disclosure';
import { groupMailDeliveries } from './mail-delivery-groups';
import type { MailFolder } from './mail-folders';
import { MailThreadRow } from './mail-thread-list';

export function MailDeliveryList({
  threads,
  mailboxAddress,
  folder,
  threadId,
  selectedThreads,
  onOpen,
  onPrefetch,
  onSelect,
}: {
  threads: MailThreadSummary[];
  mailboxAddress?: string;
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
  return groupMailDeliveries(threads, mailboxAddress).map((group) => {
    const first = group[0]!;
    if (group.length === 1) return row(first);
    const unread = group.filter((thread) => thread.unreadCount > 0).length;
    return (
      <div key={first.id} className="rounded-xl bg-muted/25">
        <MailDeliveryDisclosure
          reveal={group.some(
            (thread) => thread.id === threadId || selectedThreads.has(thread.id)
          )}
        >
          <summary className="cursor-pointer list-none rounded-xl px-3 py-2.5 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-center gap-2">
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/deliveries:rotate-90" />
              <span className="min-w-0 flex-1 truncate font-medium text-sm">
                {first.participants[0]?.displayName ||
                  first.participants[0]?.address}
              </span>
              <span className="shrink-0 text-muted-foreground text-xs">
                {t('similar_deliveries', { count: group.length })}
              </span>
              {unread > 0 ? (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium text-xs">
                  {t('delivery_unread_count', { count: unread })}
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate pl-5.5 text-muted-foreground text-xs">
              {first.subject || t('no_subject')}
            </p>
          </summary>
          <div className="space-y-0.5 border-dynamic border-t p-1">
            {group.map(row)}
          </div>
        </MailDeliveryDisclosure>
      </div>
    );
  });
}
