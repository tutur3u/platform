import { Ban } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

/** A labelled card field; compact density keeps the label for screen readers only. */
export function Field({
  label,
  compact,
  children,
}: {
  label: string;
  compact: boolean;
  children: ReactNode;
}) {
  return (
    <span className="grid min-w-0 justify-items-start gap-0.5">
      <span
        className={cn(
          'font-mono text-[10.5px] text-muted-foreground uppercase tracking-widest',
          compact && 'sr-only'
        )}
      >
        {label}
      </span>
      {children}
    </span>
  );
}

/**
 * The blocker line. Compact (one line, no fill) under a needs-you callout or in
 * compact density, so the callout stays the one loud element.
 */
export function FleetBlockedRow({
  label,
  reason,
  compact = false,
}: {
  label: string;
  reason: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-1.5 text-[13px] text-dynamic-red leading-[18px]',
        compact ? 'px-0.5' : 'rounded-xl bg-dynamic-red/15 p-2'
      )}
      data-fleet-blocked-row={compact ? 'compact' : 'full'}
    >
      <Ban aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span className={compact ? 'line-clamp-1' : 'line-clamp-2'}>
        <strong>{label}</strong> {reason}
      </span>
    </div>
  );
}
