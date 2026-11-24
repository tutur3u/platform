import { cn } from '@tuturuuu/utils/format';
import type * as React from 'react';

/**
 * The shared empty state: one icon or illustration, a short title, at most one
 * line of description and at most one action. Use it wherever a list, table,
 * board or panel has nothing to show yet, instead of a hand-built block.
 */
export interface EmptyProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  /** An icon component, drawn in a quiet circle. */
  icon?: React.ComponentType<{ className?: string }>;
  /** A larger picture that replaces the icon circle. */
  illustration?: React.ReactNode;
  title: React.ReactNode;
  /** One sentence: what will appear here, or how to add the first item. */
  description?: React.ReactNode;
  /** The single next step, usually a Button. */
  action?: React.ReactNode;
  /** Tighter spacing for panels, popovers and table bodies. */
  compact?: boolean;
  /** Draws a dashed outline, for drop zones and placeholders inside a page. */
  dashed?: boolean;
  /** Announces the state to screen readers when it appears after loading. */
  announce?: boolean;
}

export function Empty({
  icon: Icon,
  illustration,
  title,
  description,
  action,
  compact = false,
  dashed = false,
  announce = false,
  className,
  ...props
}: EmptyProps) {
  return (
    <div
      data-slot="empty"
      role={announce ? 'status' : undefined}
      aria-live={announce ? 'polite' : undefined}
      className={cn(
        'flex w-full flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12',
        dashed && 'rounded-lg border border-dashed',
        className
      )}
      {...props}
    >
      {illustration ??
        (Icon ? (
          <div
            data-slot="empty-icon"
            aria-hidden
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
              compact ? 'size-9' : 'size-11'
            )}
          >
            <Icon className={compact ? 'size-4' : 'size-5'} />
          </div>
        ) : null)}
      <div className="flex max-w-sm flex-col items-center gap-1">
        <p
          data-slot="empty-title"
          className={cn('font-medium', compact ? 'text-sm' : 'text-base')}
        >
          {title}
        </p>
        {description ? (
          <p
            data-slot="empty-description"
            className="text-balance text-muted-foreground text-sm"
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div data-slot="empty-action" className="pt-1">
          {action}
        </div>
      ) : null}
    </div>
  );
}
