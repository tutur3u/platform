'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

interface TopicAnnouncementsEmptyStateProps {
  action?: ReactNode;
  className?: string;
  description: string;
  icon: ReactNode;
  title: string;
}

export function TopicAnnouncementsEmptyState({
  action,
  className,
  description,
  icon,
  title,
}: TopicAnnouncementsEmptyStateProps) {
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
