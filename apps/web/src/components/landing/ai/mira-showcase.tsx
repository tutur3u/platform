'use client';

import {
  ArrowUpRight,
  Bot,
  Brain,
  Sparkles,
  Zap,
} from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Grain } from '../shared/atmosphere';

const capabilityStyles = [
  {
    icon: Sparkles,
    key: 'proactive',
    className: 'border-dynamic-pink/25 bg-dynamic-pink/10 text-dynamic-pink',
  },
  {
    icon: Brain,
    key: 'contextAware',
    className:
      'border-dynamic-purple/25 bg-dynamic-purple/10 text-dynamic-purple',
  },
  {
    icon: Zap,
    key: 'learning',
    className: 'border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue',
  },
] as const;

/** Cycles the highlighted prompt so the panel feels alive without autoplay. */
function useRotatingIndex(length: number, intervalMs = 3200) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced || length < 2) return;
    const id = setInterval(
      () => setIndex((value) => (value + 1) % length),
      intervalMs
    );
    return () => clearInterval(id);
  }, [length, intervalMs, reduced]);

  return index;
}

export function MiraShowcase() {
  const t = useTranslations('landing.ai.mira');
  const prompts = [t('prompts.0'), t('prompts.1'), t('prompts.2')];
  const active = useRotatingIndex(prompts.length);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-dynamic-purple/20 bg-foreground/[0.02]">
      {/* Aura behind the avatar */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-[12%] h-72 w-72 animate-bloom-drift rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--purple)_55%,transparent),transparent)] opacity-30 blur-3xl motion-reduce:animate-none dark:opacity-40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-purple/50 to-transparent"
      />
      <Grain />

      {/* Header */}
      <div className="relative border-dynamic-purple/10 border-b p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-dynamic-purple/25 bg-gradient-to-br from-dynamic-pink/20 to-dynamic-purple/20">
            <span
              aria-hidden
              className="absolute inset-0 animate-ring-pulse rounded-2xl bg-dynamic-purple/30"
            />
            <Bot className="relative h-6 w-6 text-dynamic-pink" />
          </div>

          <div className="flex-1">
            <h3 className="font-display font-semibold text-2xl tracking-[-0.02em]">
              {t('title')}
            </h3>
            <p className="mt-2 max-w-xl text-foreground/55 text-sm leading-relaxed">
              {t('description')}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {capabilityStyles.map((capability) => (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono-ui text-[0.62rem] uppercase tracking-[0.14em]',
                    capability.className
                  )}
                  key={capability.key}
                >
                  <capability.icon className="h-3 w-3" />
                  {t(`capabilities.${capability.key}` as never)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Prompt rail */}
      <div className="relative p-6 sm:p-8">
        <div className="mb-4 font-mono-ui text-[0.62rem] text-foreground/35 uppercase tracking-[0.2em]">
          {t('tryAsking')}
        </div>

        <div className="grid gap-2">
          {prompts.map((prompt, index) => {
            const isActive = index === active;

            return (
              <button
                className={cn(
                  'group relative flex items-center justify-between gap-4 overflow-hidden rounded-xl border px-4 py-3 text-left transition-all duration-500',
                  isActive
                    ? 'border-dynamic-purple/35 bg-dynamic-purple/[0.08]'
                    : 'border-foreground/[0.08] bg-transparent hover:border-foreground/15 hover:bg-foreground/[0.03]'
                )}
                key={prompt}
                type="button"
              >
                {/* Scanning highlight on the active row */}
                {isActive ? (
                  <motion.span
                    animate={{ x: '120%' }}
                    aria-hidden
                    className="absolute inset-y-0 w-1/3 bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--purple)_18%,transparent),transparent)]"
                    initial={{ x: '-120%' }}
                    transition={{
                      duration: 1.8,
                      ease: 'easeInOut',
                      repeat: Number.POSITIVE_INFINITY,
                      repeatDelay: 0.6,
                    }}
                  />
                ) : null}

                <span
                  className={cn(
                    'relative text-sm transition-colors duration-300',
                    isActive ? 'text-foreground' : 'text-foreground/60'
                  )}
                >
                  {prompt}
                </span>

                <ArrowUpRight
                  className={cn(
                    'relative h-4 w-4 shrink-0 transition-all duration-300',
                    isActive
                      ? 'text-dynamic-purple opacity-100'
                      : 'text-foreground/30 opacity-0 group-hover:opacity-100'
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
