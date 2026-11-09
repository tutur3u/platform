import { cn } from '@tuturuuu/utils/format';

export type StatTone =
  | 'blue'
  | 'purple'
  | 'green'
  | 'cyan'
  | 'orange'
  | 'pink'
  | 'red'
  | 'yellow'
  | 'neutral';

const tones: Record<StatTone, string> = {
  blue: 'text-dynamic-blue',
  purple: 'text-dynamic-purple',
  green: 'text-dynamic-green',
  cyan: 'text-dynamic-cyan',
  orange: 'text-dynamic-orange',
  pink: 'text-dynamic-pink',
  red: 'text-dynamic-red',
  yellow: 'text-dynamic-yellow',
  neutral: 'text-foreground/80',
};

export interface StatItem {
  value: string;
  label: string;
  tone?: StatTone;
}

/**
 * A row of figures as one divided instrument panel.
 *
 * Used wherever a page needs to state a handful of numbers without turning
 * them into another grid of cards — the landing problem section uses the same
 * shape, so the pages read as one family.
 */
export function StatStrip({
  stats,
  className,
}: {
  stats: StatItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015]',
        className
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
      />

      <dl
        className={cn(
          'grid divide-y divide-foreground/[0.07] sm:divide-x sm:divide-y-0',
          stats.length === 2 && 'sm:grid-cols-2',
          stats.length === 3 && 'sm:grid-cols-3',
          stats.length >= 4 && 'grid-cols-2 sm:grid-cols-4'
        )}
      >
        {stats.map((stat) => (
          <div
            className="flex flex-col items-center gap-2 px-5 py-7 text-center"
            key={stat.label}
          >
            <dd
              className={cn(
                'font-display font-semibold text-3xl tabular-nums tracking-[-0.04em] sm:text-4xl',
                tones[stat.tone ?? 'neutral']
              )}
            >
              {stat.value}
            </dd>
            <dt className="font-mono-ui text-[0.64rem] text-foreground/40 uppercase tracking-[0.16em]">
              {stat.label}
            </dt>
          </div>
        ))}
      </dl>
    </div>
  );
}
