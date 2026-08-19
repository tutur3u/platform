'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';

interface TaskDescriptionStorageToolbarItemProps {
  counterText: string;
  currentLength: number;
  isOverLimit: boolean;
  limit: number;
  liveMessage: string;
  percentLeft: number;
  statusText: string;
}

export function TaskDescriptionStorageToolbarItem({
  counterText,
  currentLength,
  isOverLimit,
  limit,
  liveMessage,
  percentLeft,
  statusText,
}: TaskDescriptionStorageToolbarItemProps) {
  const progressPercent = isOverLimit
    ? 100
    : Math.max(0, Math.min(100, 100 - percentLeft));
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progressPercent / 100) * circumference;
  const isWarning = !isOverLimit && progressPercent >= 85;
  const toneClass = isOverLimit
    ? 'text-destructive'
    : isWarning
      ? 'text-dynamic-yellow'
      : 'text-dynamic-green';
  const strokeClass = isOverLimit
    ? 'stroke-destructive'
    : isWarning
      ? 'stroke-dynamic-yellow'
      : 'stroke-dynamic-green';

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={liveMessage}
            className={cn(
              'flex h-8 max-w-72 shrink-0 items-center gap-1.5 rounded-md border bg-dynamic-surface/35 px-2 text-left text-xs transition-colors hover:bg-dynamic-surface/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              isOverLimit
                ? 'border-destructive/40'
                : isWarning
                  ? 'border-dynamic-yellow/40'
                  : 'border-dynamic-border/70'
            )}
            onMouseDown={(event) => event.preventDefault()}
          >
            <svg
              aria-hidden="true"
              className="size-5 shrink-0 -rotate-90"
              viewBox="0 0 20 20"
            >
              <circle
                className="stroke-dynamic-border/60"
                cx="10"
                cy="10"
                r={radius}
                fill="none"
                strokeWidth="2"
              />
              <circle
                className={cn('transition-all duration-200', strokeClass)}
                cx="10"
                cy="10"
                r={radius}
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              />
            </svg>
            <span
              className={cn('shrink-0 font-medium tabular-nums', toneClass)}
            >
              {counterText}
            </span>
            <span className="@lg:inline hidden min-w-0 truncate text-muted-foreground">
              {statusText}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs space-y-1">
          <p>{statusText}</p>
          <p className={cn('font-medium tabular-nums', toneClass)}>
            {counterText} ({currentLength}/{limit})
          </p>
        </TooltipContent>
      </Tooltip>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </p>
    </>
  );
}
