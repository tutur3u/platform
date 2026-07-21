'use client';

import type { LucideIcon } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { getPayBillingUrl } from '@/lib/pay-app-url';
import { PricingFeatureList } from './pricing-feature-list';
import { type PricingColor, pricingColorStyles } from './pricing-styles';

export type ColorKey = PricingColor;

interface PricingCardProps {
  icon: LucideIcon;
  name: string;
  price: string;
  period?: string;
  badge?: string;
  description: string;
  cta: string;
  ctaVariant: 'default' | 'outline';
  features: string[];
  color: ColorKey;
  /** Translated "Soon" label reused from the comparison matrix vocabulary. */
  soonLabel: string;
  highlighted?: boolean;
  isEnterprise?: boolean;
  isFree?: boolean;
}

const PRICE_SPRING = { type: 'spring', stiffness: 320, damping: 26 } as const;

export function PricingCard({
  icon: Icon,
  name,
  price,
  period,
  badge,
  description,
  cta,
  ctaVariant,
  features,
  color,
  soonLabel,
  highlighted,
  isEnterprise,
  isFree,
}: PricingCardProps) {
  const styles = pricingColorStyles[color] ?? pricingColorStyles.blue;
  const reduced = useReducedMotion();

  const href = isEnterprise
    ? '/contact'
    : isFree
      ? '/onboarding'
      : getPayBillingUrl('personal');

  return (
    <div
      className={cn('group relative h-full', highlighted && 'lg:-mt-3 lg:pb-3')}
    >
      {/* Halo — the highlighted tier casts light onto the page behind it. */}
      {highlighted ? (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute -inset-x-6 -top-8 -z-10 h-48 opacity-60 blur-3xl dark:opacity-70',
            styles.halo
          )}
        />
      ) : null}

      <div
        className={cn(
          'relative flex h-full flex-col overflow-hidden rounded-2xl border p-6 transition-all duration-500',
          highlighted
            ? cn(
                styles.border,
                'bg-gradient-to-b from-foreground/[0.06] via-foreground/[0.02] to-transparent shadow-2xl shadow-foreground/5 backdrop-blur-sm'
              )
            : cn(
                'border-foreground/[0.08] bg-foreground/[0.015] hover:-translate-y-1 hover:bg-foreground/[0.03] hover:shadow-2xl hover:shadow-foreground/5',
                styles.hoverBorder
              )
        )}
      >
        {/* Lit top edge — always on for the highlighted tier, on hover otherwise */}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent to-transparent transition-opacity duration-500',
            styles.rule,
            highlighted ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        />

        {/* Slow drifting aura inside the highlighted card. */}
        {highlighted ? (
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute -top-24 left-1/2 h-56 w-72 -translate-x-1/2 animate-bloom-drift-slow rounded-full opacity-35 blur-3xl motion-reduce:animate-none',
              styles.aura
            )}
          />
        ) : null}

        {/* Corner bloom on hover. */}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100',
            styles.bloom
          )}
        />

        <div className="relative flex h-full flex-col">
          {/* Icon + optional tier badge */}
          <div className="flex items-start justify-between gap-3">
            <span
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl border transition-transform duration-500 group-hover:scale-105',
                styles.iconSurface
              )}
            >
              <Icon className={cn('h-4 w-4', styles.icon)} />
            </span>

            {badge ? (
              <span
                className={cn(
                  'rounded-full border px-2.5 py-1 font-mono-ui text-[0.55rem] uppercase leading-none tracking-[0.16em]',
                  highlighted
                    ? styles.badge
                    : 'border-foreground/12 bg-foreground/[0.04] text-foreground/50'
                )}
              >
                {badge}
              </span>
            ) : null}
          </div>

          <h3 className="mt-5 font-display font-semibold text-lg tracking-[-0.02em]">
            {name}
          </h3>

          {/* Price — re-animates whenever the billing period flips. */}
          <div className="mt-3 flex items-baseline gap-1">
            <span className="block overflow-hidden">
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  animate={{ y: 0, opacity: 1 }}
                  className="block font-display font-semibold text-[2.75rem] tabular-nums leading-none tracking-[-0.04em]"
                  exit={reduced ? { opacity: 0 } : { y: -24, opacity: 0 }}
                  initial={reduced ? { opacity: 0 } : { y: 24, opacity: 0 }}
                  key={price}
                  transition={reduced ? { duration: 0.15 } : PRICE_SPRING}
                >
                  {price}
                </motion.span>
              </AnimatePresence>
            </span>

            <AnimatePresence initial={false} mode="wait">
              {period ? (
                <motion.span
                  animate={{ opacity: 1, x: 0 }}
                  className="font-mono-ui text-[0.7rem] text-foreground/40 tabular-nums tracking-[0.04em]"
                  exit={{ opacity: 0, x: 4 }}
                  initial={{ opacity: 0, x: -4 }}
                  key={period}
                  transition={{ duration: 0.2 }}
                >
                  {period}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>

          <p className="mt-3 text-foreground/50 text-sm leading-relaxed">
            {description}
          </p>

          {/* Hairline between the offer and what it contains. */}
          <div
            aria-hidden
            className="my-5 h-px bg-gradient-to-r from-foreground/12 via-foreground/[0.06] to-transparent"
          />

          <PricingFeatureList
            className="flex-1"
            features={features}
            soonLabel={soonLabel}
            styles={styles}
          />

          <Button
            asChild
            className={cn(
              'mt-6 w-full',
              highlighted && ctaVariant === 'default' && styles.cta
            )}
            variant={ctaVariant}
          >
            <Link href={href}>{cta}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
