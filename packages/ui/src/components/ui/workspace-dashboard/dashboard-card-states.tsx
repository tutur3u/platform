'use client';

import { CircleAlert, RefreshCw } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import type { ReactNode } from 'react';

export function DashboardRowsSkeleton({
  rows = 3,
  label,
}: {
  rows?: number;
  label: string;
}) {
  return (
    <div role="status" aria-live="polite" className="grid gap-1">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden
          className="flex h-10 min-w-0 items-center gap-3 motion-safe:animate-pulse"
        >
          <span className="size-4 shrink-0 rounded-full bg-muted" />
          <span
            className="h-3 min-w-0 rounded bg-muted"
            style={{ width: `${80 - index * 14}%` }}
          />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function DashboardCardError({
  message,
  retryLabel,
  onRetry,
  retrying,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div role="alert" className="grid min-w-0 justify-items-start gap-2 py-1">
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground text-sm">
        <CircleAlert aria-hidden className="size-4 shrink-0 text-dynamic-red" />
        <span className="min-w-0 break-words">{message}</span>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRetry}
        disabled={retrying}
      >
        <RefreshCw
          aria-hidden
          className={retrying ? 'motion-safe:animate-spin' : undefined}
        />
        {retryLabel}
      </Button>
    </div>
  );
}

export function DashboardCardEmpty({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-w-0 justify-items-start gap-2 py-1 text-muted-foreground text-sm">
      <p className="min-w-0 break-words">{children}</p>
      {action}
    </div>
  );
}
