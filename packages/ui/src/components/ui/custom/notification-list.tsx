'use client';
import { Archive, Bell, Inbox, Loader2, RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type {
  Notification,
  useInfiniteNotifications,
} from '@tuturuuu/ui/hooks/use-notifications';
import { useCallback, useEffect, useRef } from 'react';
import { NotificationCard } from './notification-card';

type TabType = 'inbox' | 'archive';
export function NotificationList({
  query,
  notifications,
  hasNotifications,
  activeTab,
  wsId,
  noNotificationsText,
  emptyArchiveText,
  loadingMoreText,
  retryText,
  acceptText,
  declineText,
  acceptedText,
  declinedText,
  markAsReadText,
  markAsUnreadText,
  onMarkAsRead,
  queryClient,
  onActionComplete,
}: {
  query: ReturnType<typeof useInfiniteNotifications>;
  notifications: Notification[];
  hasNotifications: boolean;
  activeTab: TabType;
  wsId?: string;
  noNotificationsText: string;
  emptyArchiveText: string;
  loadingMoreText: string;
  retryText: string;
  acceptText: string;
  declineText: string;
  acceptedText: string;
  declinedText: string;
  markAsReadText: string;
  markAsUnreadText: string;
  onMarkAsRead: (id: string, isUnread: boolean) => void;
  queryClient: any;
  onActionComplete: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll via IntersectionObserver
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (
        entry?.isIntersecting &&
        query.hasNextPage &&
        !query.isFetchingNextPage
      ) {
        query.fetchNextPage();
      }
    },
    [query]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(handleIntersect, {
      root: scrollRef.current,
      rootMargin: '100px',
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleIntersect]);

  const emptyText =
    activeTab === 'inbox' ? noNotificationsText : emptyArchiveText;

  if (query.error) {
    return (
      <div className="flex h-90 flex-col items-center justify-center text-center">
        <Bell className="mb-3 h-10 w-10 text-dynamic-red/30" />
        <p className="text-foreground/60 text-sm">
          Failed to load notifications
        </p>
        <p className="mt-1 text-foreground/40 text-xs">
          {query.error instanceof Error ? query.error.message : 'Unknown error'}
        </p>
        <Button
          className="mt-3"
          disabled={query.isFetching}
          onClick={() => query.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          {query.isFetching ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          )}
          {retryText}
        </Button>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="space-y-2 p-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border bg-foreground/2 p-3">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 flex-none animate-pulse rounded-full bg-foreground/10" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-24 animate-pulse rounded bg-foreground/10" />
                <div className="h-4 w-full animate-pulse rounded bg-foreground/10" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-foreground/10" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!hasNotifications) {
    return (
      <div className="flex h-90 flex-col items-center justify-center text-center">
        {activeTab === 'inbox' ? (
          <Inbox className="mb-3 h-10 w-10 text-foreground/20" />
        ) : (
          <Archive className="mb-3 h-10 w-10 text-foreground/20" />
        )}
        <p className="text-foreground/60 text-sm">{emptyText}</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="max-h-90 overflow-y-auto">
      <div className="space-y-1.5 p-2">
        {notifications.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            wsId={wsId}
            onMarkAsRead={onMarkAsRead}
            markAsReadText={markAsReadText}
            markAsUnreadText={markAsUnreadText}
            queryClient={queryClient}
            onActionComplete={onActionComplete}
            acceptText={acceptText}
            declineText={declineText}
            acceptedText={acceptedText}
            declinedText={declinedText}
          />
        ))}

        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} className="h-1" />

        {query.isFetchingNextPage && (
          <div className="flex items-center justify-center gap-2 py-3 text-foreground/40 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            {loadingMoreText}
          </div>
        )}
      </div>
    </div>
  );
}
