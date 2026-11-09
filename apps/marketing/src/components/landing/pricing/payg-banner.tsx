'use client';

import { Rocket, Sparkles, Zap } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Grain, GridSubstrate } from '../shared/atmosphere';

/**
 * Usage-based add-ons. Reads as its own moment at the foot of the pricing
 * section — same substrate, hairlines and mono labels as the cards above it,
 * with a cool-to-warm wash that separates it from the tier grid.
 */
export function PaygBanner() {
  const t = useTranslations('landing.pricing.payAsYouGo');

  const items = [
    { icon: Sparkles, label: t('features.0'), accent: 'text-dynamic-cyan' },
    { icon: Zap, label: t('features.1'), accent: 'text-dynamic-blue' },
    { icon: Rocket, label: t('features.2'), accent: 'text-dynamic-purple' },
  ];

  return (
    <div className="group relative overflow-hidden rounded-3xl border border-foreground/[0.09] bg-gradient-to-br from-dynamic-cyan/[0.05] via-dynamic-blue/[0.03] to-dynamic-purple/[0.05] p-6 transition-colors duration-500 hover:border-foreground/[0.14] sm:p-8">
      {/* Lit top edge sweeping cyan into purple. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--cyan)_60%,transparent)_30%,color-mix(in_oklab,var(--purple)_60%,transparent)_70%,transparent)]"
      />
      {/* Corner blooms — one cool, one warm, so the strip has depth. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 h-56 w-56 rounded-full bg-dynamic-cyan/20 opacity-60 blur-3xl transition-opacity duration-700 group-hover:opacity-100"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -bottom-24 h-56 w-56 rounded-full bg-dynamic-purple/20 opacity-50 blur-3xl transition-opacity duration-700 group-hover:opacity-90"
      />
      <GridSubstrate size="48px" />
      <Grain />

      <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
        <div className="max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full border border-dynamic-cyan/25 bg-dynamic-cyan/[0.08] px-2.5 py-1 font-mono-ui text-[0.55rem] text-dynamic-cyan uppercase leading-none tracking-[0.18em]">
            <span
              aria-hidden
              className="h-1 w-1 animate-ring-pulse rounded-full bg-dynamic-cyan motion-reduce:animate-none"
            />
            {t('badge')}
          </span>

          <h3 className="mt-4 font-display font-semibold text-2xl tracking-[-0.03em] sm:text-[1.75rem]">
            {t('title')}
          </h3>

          <p className="mt-2 text-foreground/50 text-sm leading-relaxed">
            {t('description')}
          </p>
        </div>

        <ul className="grid gap-2.5 sm:grid-cols-3 lg:w-[52%] lg:shrink-0">
          {items.map(({ icon: Icon, label, accent }) => (
            <li
              className="flex items-center gap-2.5 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-3 transition-colors duration-500 hover:border-foreground/15 hover:bg-foreground/[0.04]"
              key={label}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-foreground/[0.08] bg-foreground/[0.03]">
                <Icon className={cn('h-3.5 w-3.5', accent)} />
              </span>
              <span className="text-foreground/60 text-xs leading-snug">
                {label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
