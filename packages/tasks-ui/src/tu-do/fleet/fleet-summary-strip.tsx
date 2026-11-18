'use client';

import { cn } from '@tuturuuu/utils/format';
import type { FleetSummary } from './fleet-triage';
import type { FleetCopy } from './use-fleet-copy';

interface FleetSummaryStripProps {
  summary: FleetSummary;
  liveBreakdown: { running: number; review: number; ci: number };
  copy: FleetCopy;
}

function Tile({
  label,
  value,
  detail,
  loud,
  danger,
}: {
  label: string;
  value: number;
  detail: string;
  loud?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-2xl p-3.5 shadow-sm',
        loud ? 'bg-foreground text-background' : 'bg-card text-card-foreground'
      )}
    >
      <span
        className={cn(
          'font-mono text-[11px] uppercase tracking-widest',
          loud ? 'opacity-85' : 'text-muted-foreground'
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'font-extrabold text-3xl tabular-nums leading-9',
          danger && value > 0 && 'text-dynamic-red'
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          'truncate text-xs',
          loud ? 'opacity-85' : 'text-muted-foreground'
        )}
      >
        {detail}
      </span>
    </div>
  );
}

/** Needs me (the one loud tile), Live today, Blocked, Stale 24h+. */
export function FleetSummaryStrip({
  summary,
  liveBreakdown,
  copy,
}: FleetSummaryStripProps) {
  return (
    <section
      aria-label={copy.view.summaryLabel}
      className="grid grid-cols-2 gap-3 md:grid-cols-4"
    >
      <Tile
        detail={copy.view.needsDetail}
        label={copy.bucket.needs_me}
        loud={summary.needsMe > 0}
        value={summary.needsMe}
      />
      <Tile
        detail={copy.view.liveDetail(
          liveBreakdown.running,
          liveBreakdown.review,
          liveBreakdown.ci
        )}
        label={copy.bucket.live}
        value={summary.live}
      />
      <Tile
        danger
        detail={copy.view.blockedDetail}
        label={copy.bucket.blocked}
        value={summary.blocked}
      />
      <Tile
        detail={copy.view.staleDetail}
        label={copy.view.stale}
        value={summary.stale}
      />
    </section>
  );
}
