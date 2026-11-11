'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface PricingToggleProps {
  isYearly: boolean;
  onToggle: (isYearly: boolean) => void;
}

/** Runs the measurement before paint on the client, no-ops during SSR. */
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function PricingToggle({ isYearly, onToggle }: PricingToggleProps) {
  const t = useTranslations('landing.pricing.toggle');
  const monthlyRef = useRef<HTMLButtonElement>(null);
  const yearlyRef = useRef<HTMLButtonElement>(null);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const reduced = useReducedMotion();

  useIsomorphicLayoutEffect(() => {
    const measure = () => {
      const active = (isYearly ? yearlyRef : monthlyRef).current;
      if (!active) return;
      setPill({ left: active.offsetLeft, width: active.offsetWidth });
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isYearly]);

  const tabClass =
    'relative z-10 rounded-full px-4 py-2 font-mono-ui text-[0.7rem] uppercase tracking-[0.16em] transition-colors duration-300';

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
      <div className="relative inline-flex items-center rounded-full border border-foreground/[0.09] bg-foreground/[0.02] p-1">
        {/* Lit top edge, same hairline language as the cards. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
        />

        <motion.span
          animate={{ left: pill.left, width: pill.width }}
          aria-hidden
          className="absolute top-1 bottom-1 rounded-full border border-foreground/[0.09] bg-foreground/[0.06] shadow-sm"
          initial={false}
          transition={
            reduced
              ? { duration: 0 }
              : { type: 'spring', stiffness: 420, damping: 34 }
          }
        />

        <button
          aria-pressed={!isYearly}
          className={cn(
            tabClass,
            isYearly
              ? 'text-foreground/45 hover:text-foreground/70'
              : 'text-foreground'
          )}
          onClick={() => onToggle(false)}
          ref={monthlyRef}
          type="button"
        >
          {t('monthly')}
        </button>

        <button
          aria-pressed={isYearly}
          className={cn(
            tabClass,
            isYearly
              ? 'text-foreground'
              : 'text-foreground/45 hover:text-foreground/70'
          )}
          onClick={() => onToggle(true)}
          ref={yearlyRef}
          type="button"
        >
          {t('yearly')}
        </button>
      </div>

      {/* Savings note sits beside the control rather than shouting inside it. */}
      <span
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono-ui text-[0.62rem] uppercase tabular-nums tracking-[0.16em] transition-colors duration-500',
          isYearly
            ? 'border-dynamic-green/25 bg-dynamic-green/[0.08] text-dynamic-green'
            : 'border-foreground/[0.08] text-foreground/35'
        )}
      >
        <span
          aria-hidden
          className={cn(
            'h-1 w-1 rounded-full transition-colors duration-500',
            isYearly ? 'bg-dynamic-green' : 'bg-foreground/25'
          )}
        />
        {t('save')}
      </span>
    </div>
  );
}
