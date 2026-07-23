import { ArrowUpRight, Check } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import type { SurfaceAccent } from '@/components/landing/shared/surface-card';
import type { Partner } from './partner-data';

// Static maps — the page this replaces had no accent styling that survived
// Tailwind's scanner, so every partner card rendered identically.
const accents: Record<
  SurfaceAccent,
  { rule: string; bloom: string; chip: string; tick: string }
> = {
  blue: {
    rule: 'via-dynamic-blue/45',
    bloom: 'bg-dynamic-blue/20',
    chip: 'border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue',
    tick: 'text-dynamic-blue/70',
  },
  green: {
    rule: 'via-dynamic-green/45',
    bloom: 'bg-dynamic-green/20',
    chip: 'border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green',
    tick: 'text-dynamic-green/70',
  },
  purple: {
    rule: 'via-dynamic-purple/45',
    bloom: 'bg-dynamic-purple/20',
    chip: 'border-dynamic-purple/25 bg-dynamic-purple/10 text-dynamic-purple',
    tick: 'text-dynamic-purple/70',
  },
  cyan: {
    rule: 'via-dynamic-cyan/45',
    bloom: 'bg-dynamic-cyan/20',
    chip: 'border-dynamic-cyan/25 bg-dynamic-cyan/10 text-dynamic-cyan',
    tick: 'text-dynamic-cyan/70',
  },
  orange: {
    rule: 'via-dynamic-orange/45',
    bloom: 'bg-dynamic-orange/20',
    chip: 'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange',
    tick: 'text-dynamic-orange/70',
  },
  pink: {
    rule: 'via-dynamic-pink/45',
    bloom: 'bg-dynamic-pink/20',
    chip: 'border-dynamic-pink/25 bg-dynamic-pink/10 text-dynamic-pink',
    tick: 'text-dynamic-pink/70',
  },
  red: {
    rule: 'via-dynamic-red/45',
    bloom: 'bg-dynamic-red/20',
    chip: 'border-dynamic-red/25 bg-dynamic-red/10 text-dynamic-red',
    tick: 'text-dynamic-red/70',
  },
  yellow: {
    rule: 'via-dynamic-yellow/45',
    bloom: 'bg-dynamic-yellow/20',
    chip: 'border-dynamic-yellow/25 bg-dynamic-yellow/10 text-dynamic-yellow',
    tick: 'text-dynamic-yellow/70',
  },
};

export function PartnerCard({
  partner,
  featured = false,
}: {
  partner: Partner;
  featured?: boolean;
}) {
  const styles = accents[partner.accent];

  return (
    <a
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-5 transition-all duration-500',
        'hover:-translate-y-1 hover:border-foreground/15 hover:bg-foreground/[0.03] hover:shadow-2xl hover:shadow-foreground/5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        featured && 'sm:p-6'
      )}
      href={partner.website}
      rel="noopener noreferrer"
      target="_blank"
    >
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

      <div className="relative flex items-start gap-3">
        {/* biome-ignore lint/performance/noImgElement: the marketing bundle is kept off next/image by the public shell compile graph. */}
        <img
          alt=""
          className={cn(
            'shrink-0 rounded-xl border border-foreground/10 object-cover transition-transform duration-500 group-hover:scale-105',
            featured ? 'h-14 w-14' : 'h-11 w-11'
          )}
          loading="lazy"
          src={partner.logo}
        />

        <div className="min-w-0 flex-1">
          <span
            className={cn(
              'inline-flex rounded-full border px-2 py-0.5 font-mono-ui text-[0.55rem] uppercase tracking-[0.14em]',
              styles.chip
            )}
          >
            {partner.category}
          </span>
          <h3
            className={cn(
              'mt-2 flex items-start gap-1.5 font-display font-semibold tracking-[-0.01em]',
              featured ? 'text-lg' : 'text-base'
            )}
          >
            <span className="min-w-0">{partner.name}</span>
            <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-foreground/25 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground/50" />
          </h3>
        </div>
      </div>

      <p className="relative mt-4 text-foreground/50 text-sm leading-relaxed">
        {partner.description}
      </p>

      <ul className="relative mt-5 grid gap-2 border-foreground/[0.07] border-t pt-4 sm:mt-auto">
        {partner.highlights.map((highlight) => (
          <li
            className="flex items-start gap-2 text-foreground/45 text-xs"
            key={highlight}
          >
            <Check className={cn('mt-0.5 h-3 w-3 shrink-0', styles.tick)} />
            {highlight}
          </li>
        ))}
      </ul>
    </a>
  );
}
