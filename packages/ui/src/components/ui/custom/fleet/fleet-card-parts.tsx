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

/** The one-line blocker shown when a card is not waiting on you. */
export function FleetBlockedRow({
  label,
  reason,
}: {
  label: string;
  reason: ReactNode;
}) {
  return (
    <div className="flex items-start gap-1.5 rounded-xl bg-dynamic-red/15 p-2 text-[13px] text-dynamic-red leading-[18px]">
      <Ban aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span className="line-clamp-2">
        <strong>{label}</strong> {reason}
      </span>
    </div>
  );
}
