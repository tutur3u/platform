import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

export interface MarketingStat {
  id: string;
  /** The number itself — kept short so the row stays on one line on mobile. */
  value: ReactNode;
  label: ReactNode;
}

/**
 * Row of headline figures under a hero.
 *
 * Values render in the mono face with `tabular-nums` so a band that animates or
 * re-renders (live counters, locale switches) does not reflow its neighbours.
 */
export function MarketingStatBand({
  stats,
  className,
}: {
  stats: MarketingStat[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid w-full grid-cols-2 gap-px overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.06] sm:grid-cols-4',
        className
      )}
    >
      {stats.map((stat) => (
        <div
          className="flex flex-col items-center gap-1 bg-background px-4 py-6 text-center"
          key={stat.id}
        >
          <dt className="order-2 text-[0.7rem] text-foreground/45 uppercase tracking-[0.16em]">
            {stat.label}
          </dt>
          <dd className="order-1 font-display font-semibold text-2xl tabular-nums tracking-[-0.02em] sm:text-3xl">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
