import { cn } from '@tuturuuu/utils/format';
import type { SurfaceAccent } from '@/components/landing/shared/surface-card';
import type { RoleArea } from './careers-data';

const accents: Record<
  SurfaceAccent,
  { icon: string; rule: string; bloom: string; chip: string }
> = {
  blue: {
    icon: 'text-dynamic-blue',
    rule: 'via-dynamic-blue/45',
    bloom: 'bg-dynamic-blue/20',
    chip: 'border-dynamic-blue/20 text-dynamic-blue/85',
  },
  green: {
    icon: 'text-dynamic-green',
    rule: 'via-dynamic-green/45',
    bloom: 'bg-dynamic-green/20',
    chip: 'border-dynamic-green/20 text-dynamic-green/85',
  },
  purple: {
    icon: 'text-dynamic-purple',
    rule: 'via-dynamic-purple/45',
    bloom: 'bg-dynamic-purple/20',
    chip: 'border-dynamic-purple/20 text-dynamic-purple/85',
  },
  cyan: {
    icon: 'text-dynamic-cyan',
    rule: 'via-dynamic-cyan/45',
    bloom: 'bg-dynamic-cyan/20',
    chip: 'border-dynamic-cyan/20 text-dynamic-cyan/85',
  },
  orange: {
    icon: 'text-dynamic-orange',
    rule: 'via-dynamic-orange/45',
    bloom: 'bg-dynamic-orange/20',
    chip: 'border-dynamic-orange/20 text-dynamic-orange/85',
  },
  pink: {
    icon: 'text-dynamic-pink',
    rule: 'via-dynamic-pink/45',
    bloom: 'bg-dynamic-pink/20',
    chip: 'border-dynamic-pink/20 text-dynamic-pink/85',
  },
  red: {
    icon: 'text-dynamic-red',
    rule: 'via-dynamic-red/45',
    bloom: 'bg-dynamic-red/20',
    chip: 'border-dynamic-red/20 text-dynamic-red/85',
  },
  yellow: {
    icon: 'text-dynamic-yellow',
    rule: 'via-dynamic-yellow/45',
    bloom: 'bg-dynamic-yellow/20',
    chip: 'border-dynamic-yellow/20 text-dynamic-yellow/85',
  },
};

/** A discipline we hire into, with the shapes it currently covers. */
export function RoleCard({ role }: { role: RoleArea }) {
  const styles = accents[role.accent];

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-6 transition-all duration-500 hover:-translate-y-1 hover:border-foreground/15 hover:bg-foreground/[0.03]">
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent to-transparent opacity-40 transition-opacity duration-500 group-hover:opacity-100',
          styles.rule
        )}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100',
          styles.bloom
        )}
      />

      <div className="relative flex items-center gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.03] transition-transform duration-500 group-hover:scale-105',
            styles.icon
          )}
        >
          <role.icon className="h-4 w-4" />
        </span>
        <h3 className="font-display font-semibold text-xl tracking-[-0.02em]">
          {role.area}
        </h3>
      </div>

      <p className="relative mt-4 text-foreground/50 text-sm leading-relaxed">
        {role.description}
      </p>

      <div className="relative mt-5 flex flex-wrap gap-1.5 border-foreground/[0.07] border-t pt-5 sm:mt-auto">
        {role.positions.map((position) => (
          <span
            className={cn(
              'rounded-full border bg-foreground/[0.02] px-2.5 py-1 font-mono-ui text-[0.58rem] uppercase tracking-[0.12em]',
              styles.chip
            )}
            key={position}
          >
            {position}
          </span>
        ))}
      </div>
    </div>
  );
}
