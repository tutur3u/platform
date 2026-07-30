'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useLocale } from 'next-intl';
import type { ReactNode } from 'react';
import { formatRelativeTimestamp } from './relative-time';

export function RelativeTimestamp({
  className,
  fallback = '—',
  value,
}: {
  className?: string;
  fallback?: ReactNode;
  value: string | null | undefined;
}) {
  const locale = useLocale();
  const timestamp = formatRelativeTimestamp(value, locale);

  if (!timestamp) return fallback;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={`${timestamp.relative}. ${timestamp.exact}`}
          className={cn(
            'cursor-help whitespace-nowrap underline decoration-dotted underline-offset-4',
            className
          )}
          type="button"
        >
          <time dateTime={timestamp.iso} suppressHydrationWarning>
            {timestamp.relative}
          </time>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <span suppressHydrationWarning>{timestamp.exact}</span>
      </TooltipContent>
    </Tooltip>
  );
}
