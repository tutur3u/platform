'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useId } from 'react';
import { MiraAvatar } from './mira-profile';

export type RoomMiraChipState = 'choose' | 'on' | 'off' | 'pausing' | 'host';

const dots: Record<RoomMiraChipState, string> = {
  on: 'bg-dynamic-green',
  choose: 'bg-dynamic-orange',
  pausing: 'bg-dynamic-orange motion-safe:animate-pulse',
  off: 'bg-muted-foreground/40',
  host: 'bg-muted-foreground/40',
};

/**
 * The one Mira control in the call header: the name and a status dot (green
 * on, amber while a choice is pending, muted off). `title` is the full
 * statement of the room's Mira state; it is the accessible name and the
 * popover's label, so the short visible label never hides who turned Mira on.
 */
export function RoomMiraChip({
  state,
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  state: RoomMiraChipState;
  title: string;
  /** What the dot means for this person, read after the name. */
  description?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const descriptionId = useId();
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={title}
          aria-describedby={description ? descriptionId : undefined}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-background px-2.5 font-medium text-xs outline-hidden transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pointer-coarse:h-11"
        >
          <MiraAvatar size={16} />
          <span aria-hidden>Mira</span>
          <span
            aria-hidden
            data-state={state}
            className={cn('size-2 shrink-0 rounded-full', dots[state])}
          />
          {description && (
            <span id={descriptionId} className="sr-only">
              {description}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={title}
        align="end"
        collisionPadding={12}
        className="max-h-[min(32rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw-1.5rem))] space-y-3 overflow-y-auto text-sm [--popover-padding:0.875rem]"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
