'use client';

import {
  Check,
  Info,
  Loader2,
  Pause,
  Power,
  ShieldCheck,
} from '@tuturuuu/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

export type RoomMiraChipState =
  | 'choose'
  | 'on'
  | 'off'
  | 'pausing'
  | 'host'
  | 'permissions';

const icons = {
  choose: Info,
  on: Check,
  off: Pause,
  pausing: Loader2,
  host: Power,
  permissions: ShieldCheck,
} as const;

/**
 * One line that summarizes Mira's state for this room. Everything else opens
 * in a popover, which keeps focus inside while it is open and returns it to the
 * chip on Escape. The header variant drops the details link and aligns the
 * popover to the end of the call header.
 */
export function RoomMiraChip({
  state,
  label,
  detailsLabel,
  title,
  variant = 'chat',
  open,
  onOpenChange,
  children,
}: {
  state: RoomMiraChipState;
  label: string;
  detailsLabel: string;
  title: string;
  variant?: 'chat' | 'header';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const Icon = icons[state];
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex min-h-8 max-w-full items-center gap-2 rounded-full border bg-muted/25 px-3 text-xs outline-hidden transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pointer-coarse:min-h-11',
            // The indicator stays visible beside the call controls on phones.
            variant === 'header' && 'max-w-48 sm:max-w-72'
          )}
        >
          <Icon
            aria-hidden
            className={cn(
              'size-3.5 shrink-0',
              state === 'on' && 'text-dynamic-green',
              (state === 'choose' || state === 'host') && 'text-dynamic-purple',
              (state === 'off' || state === 'permissions') &&
                'text-muted-foreground',
              state === 'pausing' && 'animate-spin motion-reduce:animate-none'
            )}
          />
          <span className="min-w-0 truncate font-medium">{label}</span>
          {variant === 'chat' && (
            <>
              {' '}
              <span aria-hidden>·</span>{' '}
              <span className="shrink-0 text-muted-foreground underline underline-offset-2">
                {detailsLabel}
              </span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={title}
        align={variant === 'header' ? 'end' : 'start'}
        collisionPadding={12}
        className="max-h-[min(32rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw-1.5rem))] space-y-3 overflow-y-auto text-sm [--popover-padding:0.875rem]"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
