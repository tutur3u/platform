'use client';

import { Cpu, Radar, Zap } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';

const steps: Array<{
  key: 'sense' | 'reason' | 'act';
  icon: ComponentType<{ className?: string }>;
  accent: string;
  ring: string;
}> = [
  {
    key: 'sense',
    icon: Radar,
    accent: 'text-dynamic-cyan',
    ring: 'border-dynamic-cyan/30 bg-dynamic-cyan/10',
  },
  {
    key: 'reason',
    icon: Cpu,
    accent: 'text-dynamic-blue',
    ring: 'border-dynamic-blue/30 bg-dynamic-blue/10',
  },
  {
    key: 'act',
    icon: Zap,
    accent: 'text-dynamic-purple',
    ring: 'border-dynamic-purple/30 bg-dynamic-purple/10',
  },
];

/**
 * Sense → Reason → Act.
 *
 * A signal pulse travels the connective rail so the three stages read as one
 * continuous flow rather than three unrelated cards.
 */
export function AiPipeline() {
  const t = useTranslations('landing.aiCapabilities.pipeline');
  const reduced = useReducedMotion();

  return (
    <div className="relative">
      <div className="mb-8 text-center font-mono-ui text-[0.62rem] text-foreground/35 uppercase tracking-[0.2em]">
        {t('caption')}
      </div>

      <div className="relative">
        {/* Connective rail — behind the cards, hidden when they stack */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[16%] top-7 hidden h-px overflow-hidden bg-gradient-to-r from-dynamic-cyan/30 via-dynamic-blue/30 to-dynamic-purple/30 md:block"
        >
          {reduced ? null : (
            <motion.div
              animate={{ x: ['-30%', '130%'] }}
              className="h-full w-1/4 bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--foreground)_75%,transparent),transparent)]"
              transition={{
                duration: 3.2,
                ease: 'easeInOut',
                repeat: Number.POSITIVE_INFINITY,
                repeatDelay: 0.8,
              }}
            />
          )}
        </div>

        <ol className="relative grid gap-8 md:grid-cols-3 md:gap-6">
          {steps.map((step, index) => (
            <motion.li
              className="flex flex-col items-center text-center"
              initial={reduced ? false : { opacity: 0, y: 20 }}
              key={step.key}
              transition={{
                delay: index * 0.12,
                duration: 0.6,
                ease: [0.16, 1, 0.3, 1],
              }}
              viewport={{ once: true, margin: '-80px' }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <div
                className={cn(
                  'flex h-14 w-14 items-center justify-center rounded-2xl border backdrop-blur-md',
                  step.ring
                )}
              >
                <step.icon className={cn('h-5 w-5', step.accent)} />
              </div>

              <div
                className={cn(
                  'mt-5 font-mono-ui text-[0.62rem] uppercase tracking-[0.2em]',
                  step.accent
                )}
              >
                <span className="mr-2 text-foreground/30 tabular-nums">
                  {`0${index + 1}`}
                </span>
                {t(`${step.key}.label` as never)}
              </div>

              <p className="mt-3 max-w-xs text-balance text-foreground/50 text-sm leading-relaxed">
                {t(`${step.key}.description` as never)}
              </p>
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  );
}
