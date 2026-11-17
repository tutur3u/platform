'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType, ReactNode } from 'react';
import type { QuickCreateChipId } from './quick-create-values';

interface QuickCreateChipProps {
  id: QuickCreateChipId;
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** The current value; `null` renders the dashed empty state. */
  value: ReactNode | null;
  /** Shown under the label on phone tiles while the property is empty. */
  emptyValue: string;
  open: boolean;
  disabled?: boolean;
  contentClassName?: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/**
 * One labeled property of the quick-create dialog. Desktop renders a pill
 * (icon, muted label, value); phones render a two-line tile. The picker
 * portals out of the dialog so its scrolling body never clips it.
 */
export function QuickCreateChip({
  id,
  icon: Icon,
  label,
  value,
  emptyValue,
  open,
  disabled = false,
  contentClassName,
  onOpenChange,
  children,
}: QuickCreateChipProps) {
  const empty = value === null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-quick-create-chip={id}
          data-empty={empty ? 'true' : undefined}
          disabled={disabled}
          className={cn(
            'inline-flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-full border px-3 text-left font-medium text-sm transition-colors',
            'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover data-[state=open]:bg-accent',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'max-sm:h-auto max-sm:min-h-14 max-sm:w-full max-sm:flex-col max-sm:items-start max-sm:justify-center max-sm:gap-0.5 max-sm:rounded-lg max-sm:py-2',
            empty
              ? 'border-input border-dashed bg-transparent text-muted-foreground'
              : 'border-border bg-background text-foreground'
          )}
        >
          <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground max-sm:text-xs">
            <span aria-hidden="true" className="inline-flex shrink-0">
              <Icon className="size-3.5" />
            </span>
            <span>{label}</span>
          </span>
          {empty ? (
            <span className="text-muted-foreground sm:hidden max-sm:text-base">
              {emptyValue}
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-1 truncate font-semibold max-sm:w-full max-sm:text-base">
              {value}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className={cn(
          'w-64 overflow-hidden p-0 max-sm:w-[calc(100vw-2rem)]',
          contentClassName
        )}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
