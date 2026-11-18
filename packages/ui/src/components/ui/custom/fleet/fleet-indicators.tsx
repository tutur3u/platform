import { Clock, Hand } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

export type FleetEtaStateValue = 'on_track' | 'due_soon' | 'overdue' | 'none';
export type FleetStalenessValue = 'fresh' | 'aging' | 'stale' | 'unknown';

export interface EtaIndicatorProps {
  state: FleetEtaStateValue;
  /** The formatted time; ignored when `state` is `none`. */
  label?: ReactNode;
  emptyLabel: string;
  overdueLabel: string;
  title?: string;
  className?: string;
}

/** When the owner expects to finish. Overdue adds its word in red; no ETA says so. */
export function EtaIndicator({
  state,
  label,
  emptyLabel,
  overdueLabel,
  title,
  className,
}: EtaIndicatorProps) {
  const none = state === 'none' || !label;
  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 font-semibold text-xs',
        none && 'font-normal text-muted-foreground',
        state === 'due_soon' && 'text-dynamic-orange',
        state === 'overdue' && 'text-dynamic-red',
        className
      )}
      data-eta-state={none ? 'none' : state}
      title={title}
    >
      <Clock aria-hidden className="size-3.5 shrink-0" />
      <span>{none ? emptyLabel : label}</span>
      {state === 'overdue' && !none ? (
        <span className="font-extrabold">{overdueLabel}</span>
      ) : null}
    </span>
  );
}

const DOT: Record<FleetStalenessValue, string> = {
  fresh: 'bg-dynamic-green',
  aging: 'bg-dynamic-yellow',
  stale: 'bg-dynamic-red',
  unknown: 'border border-muted-foreground bg-transparent',
};

export interface StalenessIndicatorProps {
  level: FleetStalenessValue;
  /** The age, e.g. "12m ago". */
  label?: ReactNode;
  staleLabel: string;
  unknownLabel: string;
  title?: string;
  className?: string;
}

/** How long since the last real update: fresh < 2h, aging 2-24h, stale >= 24h. */
export function StalenessIndicator({
  level,
  label,
  staleLabel,
  unknownLabel,
  title,
  className,
}: StalenessIndicatorProps) {
  const unknown = level === 'unknown' || !label;
  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs',
        unknown ? 'text-muted-foreground' : 'font-semibold',
        level === 'stale' && 'text-dynamic-red',
        className
      )}
      data-staleness={unknown ? 'unknown' : level}
      title={title}
    >
      <span
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full',
          DOT[unknown ? 'unknown' : level]
        )}
      />
      <span className={cn(!unknown && 'font-mono tabular-nums')}>
        {unknown ? unknownLabel : label}
      </span>
      {level === 'stale' && !unknown ? (
        <span className="font-extrabold">{staleLabel}</span>
      ) : null}
    </span>
  );
}

export interface NeedsUserBadgeProps {
  label: string;
  /** One line: what is being asked. With it, the badge becomes a callout. */
  reason?: ReactNode;
  className?: string;
}

/** Work waiting on you: the one ink-filled element on a fleet card. */
export function NeedsUserBadge({
  label,
  reason,
  className,
}: NeedsUserBadgeProps) {
  const pill = (
    <span className="inline-flex h-[22px] w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-foreground px-2.5 font-bold text-background text-xs">
      <Hand aria-hidden className="size-3.5" />
      {label}
    </span>
  );
  if (!reason) return <span className={className}>{pill}</span>;
  return (
    <div
      className={cn(
        'flex w-full flex-col items-start gap-1.5 rounded-xl bg-dynamic-yellow/15 p-2 text-dynamic-yellow',
        className
      )}
      role="note"
    >
      {pill}
      <span className="line-clamp-2 font-semibold text-[13px] leading-5">
        {reason}
      </span>
    </div>
  );
}
