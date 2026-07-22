import type { LucideIcon } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';

export type StatColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue';

// Static class maps: Tailwind cannot see interpolated `dynamic-${color}` classes.
const colorStyles: Record<
  StatColor,
  { icon: string; value: string; rule: string; bloom: string }
> = {
  red: {
    icon: 'text-dynamic-red',
    value: 'text-dynamic-red',
    rule: 'via-dynamic-red/50',
    bloom: 'bg-dynamic-red/20',
  },
  orange: {
    icon: 'text-dynamic-orange',
    value: 'text-dynamic-orange',
    rule: 'via-dynamic-orange/50',
    bloom: 'bg-dynamic-orange/20',
  },
  yellow: {
    icon: 'text-dynamic-yellow',
    value: 'text-dynamic-yellow',
    rule: 'via-dynamic-yellow/50',
    bloom: 'bg-dynamic-yellow/20',
  },
  green: {
    icon: 'text-dynamic-green',
    value: 'text-dynamic-green',
    rule: 'via-dynamic-green/50',
    bloom: 'bg-dynamic-green/20',
  },
  blue: {
    icon: 'text-dynamic-blue',
    value: 'text-dynamic-blue',
    rule: 'via-dynamic-blue/50',
    bloom: 'bg-dynamic-blue/20',
  },
};

interface StatCardProps {
  icon: LucideIcon;
  value: string;
  label: string;
  color: StatColor;
}

export function StatCard({ icon: Icon, value, label, color }: StatCardProps) {
  const styles = colorStyles[color];

  return (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-6 transition-all duration-500 hover:border-foreground/15 hover:bg-foreground/[0.03]">
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent to-transparent opacity-50 transition-opacity duration-500 group-hover:opacity-100',
          styles.rule
        )}
      />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-14 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100',
          styles.bloom
        )}
      />

      <div className="relative">
        <Icon
          className={cn(
            'h-4 w-4 transition-transform duration-500 group-hover:scale-110',
            styles.icon
          )}
        />
        <span
          className={cn(
            'mt-6 block font-display font-semibold text-5xl tabular-nums tracking-[-0.04em]',
            styles.value
          )}
        >
          {value}
        </span>
        <div className="mt-2 font-mono-ui text-[0.68rem] text-foreground/40 uppercase tracking-[0.16em]">
          {label}
        </div>
      </div>
    </div>
  );
}
