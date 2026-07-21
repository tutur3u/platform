'use client';

import {
  Bot,
  Brain,
  Calendar,
  Check,
  CheckCircle2,
  FileText,
  Mail,
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

/** Context sources Mira reads before acting, reusing the product names. */
const sources = [
  { key: 'calendar', icon: Calendar, accent: 'text-dynamic-blue' },
  { key: 'mail', icon: Mail, accent: 'text-dynamic-red' },
  { key: 'tasks', icon: CheckCircle2, accent: 'text-dynamic-green' },
  { key: 'documents', icon: FileText, accent: 'text-dynamic-orange' },
] as const;

/** Outcome shown for each prompt, drawn from the capability list below. */
const outcomes = ['scheduling', 'insight', 'extraction'] as const;

/**
 * Runs the cockpit: each prompt is picked up, its sources scanned, then the
 * outcome lands — and the cycle moves to the next prompt.
 *
 * Under reduced motion the run sits at its completed state and never advances,
 * so the panel is fully legible without anything moving.
 */
function useAgentRun(promptCount: number) {
  const reduced = useReducedMotion();
  const [prompt, setPrompt] = useState(0);
  const [phase, setPhase] = useState(reduced ? 3 : 0);

  useEffect(() => {
    if (reduced) {
      setPhase(3);
      return;
    }

    // 0: idle → 1: reading sources → 2: reasoning → 3: acted
    const timings = [700, 1500, 900, 1700];
    let timer: ReturnType<typeof setTimeout>;

    const step = (next: number) => {
      if (next > 3) {
        setPrompt((value) => (value + 1) % promptCount);
        setPhase(0);
        timer = setTimeout(() => step(1), timings[0]);
        return;
      }
      setPhase(next);
      timer = setTimeout(() => step(next + 1), timings[next]);
    };

    timer = setTimeout(() => step(1), timings[0]);
    return () => clearTimeout(timer);
  }, [promptCount, reduced]);

  return { prompt, phase, reduced: reduced === true };
}

export function MiraShowcase() {
  const t = useTranslations('landing.ai.mira');
  const tPipeline = useTranslations('landing.aiCapabilities.pipeline');
  const tCapabilities = useTranslations('landing.aiCapabilities.capabilities');
  const tProducts = useTranslations('marketing-nav.products');

  const prompts = [t('prompts.0'), t('prompts.1'), t('prompts.2')];
  const { prompt, phase, reduced } = useAgentRun(prompts.length);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-dynamic-purple/20 bg-foreground/[0.02]">
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

      {/* Cockpit */}
      <div className="relative grid gap-px bg-foreground/[0.06] lg:grid-cols-[1.05fr_1fr]">
        {/* Prompt queue */}
        <div className="bg-background/20 p-6 sm:p-8">
          <div className="mb-4 font-mono-ui text-[0.62rem] text-foreground/35 uppercase tracking-[0.2em]">
            {t('tryAsking')}
          </div>

          <div className="grid gap-2">
            {prompts.map((text, index) => {
              const isActive = index === prompt;

              return (
                <div
                  className={cn(
                    'relative overflow-hidden rounded-xl border px-4 py-3 transition-all duration-500',
                    isActive
                      ? 'border-dynamic-purple/35 bg-dynamic-purple/[0.08]'
                      : 'border-foreground/[0.08] opacity-45'
                  )}
                  key={text}
                >
                  {isActive && !reduced ? (
                    <motion.span
                      animate={{ x: '130%' }}
                      aria-hidden
                      className="absolute inset-y-0 w-1/3 bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--purple)_18%,transparent),transparent)]"
                      initial={{ x: '-130%' }}
                      transition={{
                        duration: 2,
                        ease: 'easeInOut',
                        repeat: Number.POSITIVE_INFINITY,
                        repeatDelay: 0.4,
                      }}
                    />
                  ) : null}
                  <span
                    className={cn(
                      'relative text-sm',
                      isActive ? 'text-foreground' : 'text-foreground/60'
                    )}
                  >
                    {text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live run */}
        <div className="grid gap-6 bg-background/20 p-6 sm:p-8">
          <RunStage
            active={phase >= 1}
            label={tPipeline('sense.label')}
            tone="cyan"
          >
            <div className="flex flex-wrap gap-1.5">
              {sources.map((source, index) => (
                <motion.span
                  animate={{
                    opacity: phase >= 1 ? 1 : 0.25,
                    y: 0,
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] px-2 py-1"
                  initial={reduced ? false : { opacity: 0.25, y: 4 }}
                  key={source.key}
                  transition={{ delay: reduced ? 0 : index * 0.14 }}
                >
                  <source.icon className={cn('h-3 w-3', source.accent)} />
                  <span className="font-mono-ui text-[0.58rem] text-foreground/55 uppercase tracking-[0.14em]">
                    {tProducts(`${source.key}.label` as never)}
                  </span>
                </motion.span>
              ))}
            </div>
          </RunStage>

          <RunStage
            active={phase >= 2}
            label={tPipeline('reason.label')}
            tone="blue"
          >
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
              <motion.div
                animate={{ width: phase >= 2 ? '100%' : '0%' }}
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--cyan),var(--blue),var(--purple))]"
                initial={false}
                transition={{ duration: reduced ? 0 : 0.9, ease: 'easeInOut' }}
              />
            </div>
          </RunStage>

          <RunStage
            active={phase >= 3}
            label={tPipeline('act.label')}
            tone="purple"
          >
            <motion.div
              animate={{
                opacity: phase >= 3 ? 1 : 0.2,
                y: phase >= 3 ? 0 : 4,
              }}
              className="flex items-center gap-2 rounded-xl border border-dynamic-purple/25 bg-dynamic-purple/[0.08] px-3 py-2.5"
              initial={false}
              transition={{ duration: reduced ? 0 : 0.35 }}
            >
              <Check className="h-3.5 w-3.5 shrink-0 text-dynamic-purple" />
              <span className="text-foreground/75 text-sm">
                {tCapabilities(
                  `${outcomes[prompt] ?? outcomes[0]}.title` as never
                )}
              </span>
            </motion.div>
          </RunStage>
        </div>
      </div>
    </div>
  );
}

/** Static pairs — Tailwind cannot see a class derived at runtime. */
const stageTones = {
  cyan: { text: 'text-dynamic-cyan', dot: 'bg-dynamic-cyan' },
  blue: { text: 'text-dynamic-blue', dot: 'bg-dynamic-blue' },
  purple: { text: 'text-dynamic-purple', dot: 'bg-dynamic-purple' },
} as const;

function RunStage({
  label,
  tone,
  active,
  children,
}: {
  label: string;
  tone: keyof typeof stageTones;
  active: boolean;
  children: React.ReactNode;
}) {
  const styles = stageTones[tone];

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full transition-colors duration-500',
            active ? styles.dot : 'bg-foreground/15'
          )}
        />
        <span
          className={cn(
            'font-mono-ui text-[0.58rem] uppercase tracking-[0.2em] transition-colors duration-500',
            active ? styles.text : 'text-foreground/30'
          )}
        >
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}
