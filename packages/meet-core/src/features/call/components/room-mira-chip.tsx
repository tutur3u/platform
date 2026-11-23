'use client';

import {
  Check,
  Info,
  Loader2,
  Pause,
  ShieldCheck,
  Users,
} from '@tuturuuu/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

export type RoomMiraChipState =
  | 'choose'
  | 'waiting'
  | 'ready'
  | 'paused'
  | 'pausing'
  | 'permissions';

const icons = {
  choose: Info,
  waiting: Users,
  ready: Check,
  paused: Pause,
  pausing: Loader2,
  permissions: ShieldCheck,
} as const;

/**
 * One line that summarizes Mira's state for this room. Everything else opens
 * in a popover, which keeps focus inside while it is open and returns it to the
 * chip on Escape.
 */
export function RoomMiraChip({
  state,
  label,
  detailsLabel,
  title,
  children,
}: {
  state: RoomMiraChipState;
  label: string;
  detailsLabel: string;
  title: string;
  children: ReactNode;
}) {
  const Icon = icons[state];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-full border bg-muted/25 px-3 text-xs outline-hidden transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pointer-coarse:min-h-11"
        >
          <Icon
            aria-hidden
            className={cn(
              'size-3.5 shrink-0',
              state === 'ready' && 'text-dynamic-green',
              state === 'choose' && 'text-dynamic-purple',
              (state === 'waiting' ||
                state === 'paused' ||
                state === 'permissions') &&
                'text-muted-foreground',
              state === 'pausing' && 'animate-spin motion-reduce:animate-none'
            )}
          />
          <span className="min-w-0 truncate font-medium">{label}</span>{' '}
          <span aria-hidden>·</span>{' '}
          <span className="shrink-0 text-muted-foreground underline underline-offset-2">
            {detailsLabel}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={title}
        align="start"
        collisionPadding={12}
        className="max-h-[min(32rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw-1.5rem))] space-y-3 overflow-y-auto text-sm [--popover-padding:0.875rem]"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
