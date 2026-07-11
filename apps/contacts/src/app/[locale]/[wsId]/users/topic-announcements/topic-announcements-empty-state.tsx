'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Friendly, reusable empty state. Replaces bare "no data" table cells and
 * muted one-liners across the topic-announcements surfaces with a clear icon,
 * explanation, and optional call-to-action.
 */
export function TopicAnnouncementsEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: Props) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-border border-dashed bg-background px-6 py-12 text-center',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue [&>svg]:h-6 [&>svg]:w-6">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mx-auto max-w-sm text-muted-foreground text-sm">
          {description}
        </p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
