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
  const remainingPercent = Math.max(0, Math.min(100, Math.round(percentLeft)));
  const percentageText = `${remainingPercent}%`;
  const ringPercent = isOverLimit ? 100 : remainingPercent;
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (ringPercent / 100) * circumference;
  const isWarning = !isOverLimit && remainingPercent <= 15;
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
              'flex h-8 shrink-0 items-center gap-1 rounded-lg border bg-dynamic-surface/35 px-1.5 text-xs transition-colors hover:bg-dynamic-surface/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
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
              className={cn(
                'min-w-8 shrink-0 rounded-full bg-dynamic-surface px-1.5 py-0.5 text-center font-semibold text-[11px] tabular-nums leading-none',
                toneClass
              )}
            >
              {percentageText}
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
