'use client';

import { Bell, CheckCheck, CircleAlert, RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type { NotificationFilter } from '@tuturuuu/ui/hooks/use-notifications';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import type { ReactNode } from 'react';
import type { NotificationLabels } from './notification-labels';
import type { ListQuery } from './notification-list';

function State({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-full content-center justify-items-center gap-2 px-6 py-9 text-center text-muted-foreground text-sm">
      {icon}
      {children}
    </div>
  );
}

/** Loading, first-load error and empty states for the notification list. */
export function NotificationListState({
  query,
  filter,
  labels,
  onShowAll,
}: {
  query: ListQuery;
  filter: NotificationFilter;
  labels: NotificationLabels;
  onShowAll: () => void;
}) {
  if (!query.data) {
    if (query.isError) {
      return (
        <div role="alert" className="h-full">
          <State icon={<CircleAlert aria-hidden className="size-6" />}>
            <span className="font-medium text-foreground">
              {labels.loadError}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={query.isFetching}
              onClick={() => query.refetch()}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              {labels.retry}
            </Button>
          </State>
        </div>
      );
    }
    return (
      <div className="min-h-full space-y-1 p-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            aria-hidden
            className="flex items-start gap-2.5 px-2 py-2.5"
          >
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5 pt-1">
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-2.5 w-2/5" />
            </div>
          </div>
        ))}
        <span role="status" className="sr-only">
          {labels.loading}
        </span>
      </div>
    );
  }

  return filter === 'unread' ? (
    <State icon={<CheckCheck aria-hidden className="size-6" />}>
      <span className="font-medium text-foreground">{labels.allCaughtUp}</span>
      <Button size="sm" variant="outline" onClick={onShowAll}>
        {labels.showAll}
      </Button>
    </State>
  ) : (
    <State icon={<Bell aria-hidden className="size-6" />}>
      <span className="font-medium text-foreground">
        {labels.noNotifications}
      </span>
    </State>
  );
}
