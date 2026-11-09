import type { LucideIcon } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';

export type StatColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue';

// Static class maps: Tailwind cannot see interpolated `dynamic-${color}` classes.
const colorStyles: Record<StatColor, { icon: string; value: string }> = {
  red: { icon: 'text-dynamic-red/70', value: 'text-dynamic-red' },
  orange: { icon: 'text-dynamic-orange/70', value: 'text-dynamic-orange' },
  yellow: { icon: 'text-dynamic-yellow/70', value: 'text-dynamic-yellow' },
  green: { icon: 'text-dynamic-green/70', value: 'text-dynamic-green' },
  blue: { icon: 'text-dynamic-blue/70', value: 'text-dynamic-blue' },
};

export interface Stat {
  icon: LucideIcon;
  value: string;
  label: string;
  color: StatColor;
}

/**
 * The cost, as one instrument panel rather than three separate boxes.
 *
 * The section already runs a three-up row of symptom cards; repeating that
 * rhythm for the numbers made the page read as a list of identical tiles. A
 * single divided rail keeps the figures prominent without competing.
 */
export function StatRail({ stats }: { stats: Stat[] }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015]">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-red/35 to-transparent"
      />

      <div className="grid divide-y divide-foreground/[0.07] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {stats.map((stat) => (
          <div
            className="flex flex-col items-center gap-2 px-6 py-7 text-center"
            key={stat.label}
          >
            <stat.icon
              className={cn('h-4 w-4', colorStyles[stat.color].icon)}
            />
            <span
              className={cn(
                'font-display font-semibold text-4xl tabular-nums tracking-[-0.04em] sm:text-5xl',
                colorStyles[stat.color].value
              )}
            >
              {stat.value}
            </span>
            <span className="font-mono-ui text-[0.66rem] text-foreground/40 uppercase tracking-[0.16em]">
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
