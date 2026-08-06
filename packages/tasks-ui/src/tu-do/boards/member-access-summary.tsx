'use client';

import { Badge } from '@tuturuuu/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';

export type MemberAccessDetail = { id: string; label: string };

/**
 * What a member's access amounts to, in one badge.
 *
 * Four badges per row pushed the person's own name down to a few characters,
 * which inverts the point of the list: you scan it to see *who* has access. The
 * effective permission stays visible because it is the one thing that differs
 * between rows; role, ownership and membership type move into a tooltip, which
 * is where detail belongs when it is the same for almost everyone.
 */
export function MemberAccessSummary({
  className,
  details,
  permissionLabel,
  permissionTone = 'view',
  srLabel,
}: {
  className?: string;
  details: MemberAccessDetail[];
  permissionLabel: string;
  permissionTone?: 'edit' | 'view';
  srLabel: string;
}) {
  const summary = [permissionLabel, ...details.map((d) => d.label)].join(' · ');

  if (details.length === 0) {
    return (
      <Badge
        className={cn('shrink-0', className)}
        variant={permissionTone === 'edit' ? 'secondary' : 'outline'}
      >
        {permissionLabel}
      </Badge>
    );
  }

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A button so the detail is reachable by keyboard, not hover only. */}
          <button
            aria-label={`${srLabel}: ${summary}`}
            className={cn(
              'shrink-0 rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              className
            )}
            type="button"
          >
            <Badge
              className="gap-1"
              variant={permissionTone === 'edit' ? 'secondary' : 'outline'}
            >
              {permissionLabel}
              <span className="text-muted-foreground text-xs tabular-nums">
                +{details.length}
              </span>
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent align="end" className="max-w-56">
          <ul className="space-y-0.5">
            {details.map((detail) => (
              <li key={detail.id}>{detail.label}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
