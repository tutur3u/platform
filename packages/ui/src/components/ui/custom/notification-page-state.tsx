'use client';

import { CheckCheck, CircleAlert, Inbox, RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import type { ReactNode } from 'react';
import type { NotificationPageLabels } from './notification-page-labels';

/**
 * Every non-list state fills the same region so the toolbar, footer and page
 * height stay put while the list loads, empties or fails.
 */
export const NOTIFICATION_STATE_REGION = 'min-h-108';

const SKELETON_WIDTHS = ['w-9/12', 'w-7/12', 'w-10/12', 'w-8/12', 'w-6/12'];

/** Skeleton rows on the same grid and height as a notification row. */
export function NotificationPageSkeleton({
  labels,
}: {
  labels: NotificationPageLabels;
}) {
  return (
    <div
      data-notification-state="loading"
      aria-busy
      className={NOTIFICATION_STATE_REGION}
    >
      <Skeleton className="mx-2.5 mt-4 mb-2 h-3 w-16" />
      <ul className="space-y-px">
        {SKELETON_WIDTHS.map((width) => (
          <li
            key={width}
            aria-hidden
            className="grid grid-cols-[1.25rem_0.5rem_2rem_minmax(0,1fr)_auto] items-start gap-2.5 py-2.5 pr-2 pl-1.5"
          >
            <span />
            <span />
            <Skeleton className="size-8 rounded-full" />
            <div className="space-y-2 pt-0.5">
              <Skeleton className={`h-3.5 ${width}`} />
              <Skeleton className="h-3 w-5/12" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="mt-0.5 h-3 w-10" />
          </li>
        ))}
      </ul>
      <span role="status" className="sr-only">
        {labels.loading}
      </span>
    </div>
  );
}

function Region({
  state,
  icon,
  title,
  action,
  alert,
}: {
  state: 'empty' | 'error';
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      data-notification-state={state}
      role={alert ? 'alert' : undefined}
      className={`${NOTIFICATION_STATE_REGION} mt-4 grid place-content-center justify-items-center gap-3 rounded-xl border border-dashed p-6 text-center`}
    >
      <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="font-medium text-sm">{title}</p>
      {action}
    </div>
  );
}

export function NotificationPageEmpty({
  labels,
  unreadOnly,
  onShowAll,
}: {
  labels: NotificationPageLabels;
  unreadOnly: boolean;
  onShowAll: () => void;
}) {
  return unreadOnly ? (
    <Region
      state="empty"
      icon={<CheckCheck aria-hidden className="size-5" />}
      title={labels.allCaughtUp}
      action={
        <Button size="sm" variant="outline" onClick={onShowAll}>
          {labels.showAll}
        </Button>
      }
    />
  ) : (
    <Region
      state="empty"
      icon={<Inbox aria-hidden className="size-5" />}
      title={labels.noNotifications}
    />
  );
}

export function NotificationPageError({
  labels,
  retrying,
  onRetry,
}: {
  labels: NotificationPageLabels;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <Region
      state="error"
      alert
      icon={<CircleAlert aria-hidden className="size-5 text-dynamic-red" />}
      title={labels.loadError}
      action={
        <Button size="sm" disabled={retrying} onClick={onRetry}>
          <RotateCcw aria-hidden className="size-3.5" />
          {labels.retry}
        </Button>
      }
    />
  );
}
