'use client';

import {
  Calendar,
  CheckCircle2,
  Sparkles,
  Timer,
} from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * The cards that float beside the hero frame.
 *
 * Each one is a small, honest slice of a real product surface — a scheduled
 * block, a task moving to done, an assistant reply, a week of tracked hours —
 * drawn in the same authored-CSS language as the bento previews. Nothing here
 * reports a metric the platform does not actually keep.
 */

/**
 * Drifts on a long, offset cycle so the group never pulses in unison. Motion is
 * dropped entirely under `prefers-reduced-motion` via the global guard on
 * `.animate-float-y`.
 */
function FloatingCard({
  accent,
  children,
  className,
  delay,
}: {
  accent: string;
  children: ReactNode;
  className?: string;
  delay: string;
}) {
  return (
    <div
      className={cn(
        'animate-float-y rounded-xl border bg-background/80 p-3 shadow-foreground/5 shadow-lg backdrop-blur-md',
        accent,
        className
      )}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  );
}

function CardLabel({
  icon: Icon,
  accent,
  children,
  live,
}: {
  icon: typeof Calendar;
  accent: string;
  children: ReactNode;
  live?: boolean;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Icon className={cn('h-3.5 w-3.5', accent)} />
      <span className="font-mono-ui text-[0.58rem] uppercase tracking-[0.16em]">
        {children}
      </span>
      {live ? (
        <span className="relative ml-auto flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-dynamic-green opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-dynamic-green" />
        </span>
      ) : null}
    </div>
  );
}

/** Left column: a task closing, then the block the scheduler protected. */
export function HeroVignettesLeft() {
  const t = useTranslations('landing.hero.video.floatingCards');

  return (
    <div className="pointer-events-none absolute top-6 left-0 z-20 hidden -translate-x-1/2 space-y-3 lg:block">
      <FloatingCard
        accent="border-dynamic-green/25"
        className="w-52"
        delay="0s"
      >
        <CardLabel accent="text-dynamic-green" icon={CheckCircle2}>
          {t('taskCard.title')}
        </CardLabel>

        <div className="flex items-center gap-2">
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border border-dynamic-green/50 bg-dynamic-green/20">
            <span className="h-1.5 w-1.5 rounded-[1px] bg-dynamic-green" />
          </span>
          <span className="relative flex-1 text-foreground/60 text-xs">
            {t('taskCard.description')}
            <span
              aria-hidden
              className="absolute inset-x-0 top-1/2 h-px bg-foreground/25"
            />
          </span>
        </div>

        {/* The column it landed in, plus who was on it. */}
        <div className="mt-2.5 flex items-center gap-2">
          <span className="rounded-full border border-dynamic-green/25 bg-dynamic-green/10 px-1.5 py-0.5 font-mono-ui text-[0.55rem] text-dynamic-green uppercase tracking-[0.14em]">
            {t('taskCard.status')}
          </span>
          <span aria-hidden className="ml-auto flex">
            <span className="h-3 w-3 rounded-full border border-background bg-dynamic-blue/40" />
            <span className="-ml-1 h-3 w-3 rounded-full border border-background bg-dynamic-purple/40" />
          </span>
        </div>
      </FloatingCard>

      <FloatingCard
        accent="border-dynamic-blue/25"
        className="ml-10 w-48"
        delay="-2.5s"
      >
        <CardLabel accent="text-dynamic-blue" icon={Calendar}>
          {t('calendarCard.title')}
        </CardLabel>

        {/* A work week with the protected block lit. */}
        <div aria-hidden className="mb-2 flex h-10 gap-1">
          {[0, 1, 2, 3, 4].map((day) => (
            <span
              className="relative flex-1 rounded-[3px] bg-foreground/[0.05]"
              key={`day-${day}`}
            >
              {day === 2 ? (
                <span className="absolute inset-x-0 top-[18%] h-[58%] rounded-[2px] border-dynamic-blue border-l-2 bg-dynamic-blue/35" />
              ) : null}
              {day === 0 ? (
                <span className="absolute inset-x-0 top-[46%] h-[30%] rounded-[2px] bg-foreground/10" />
              ) : null}
              {day === 4 ? (
                <span className="absolute inset-x-0 top-[10%] h-[26%] rounded-[2px] bg-foreground/10" />
              ) : null}
            </span>
          ))}
        </div>

        <p className="text-foreground/60 text-xs">{t('calendarCard.event')}</p>
        <p className="mt-0.5 font-mono-ui text-[0.6rem] text-dynamic-blue tabular-nums">
          {t('calendarCard.time')}
        </p>
      </FloatingCard>
    </div>
  );
}

/** Right column: the assistant, and where the week actually went. */
export function HeroVignettesRight() {
  const t = useTranslations('landing.hero.video.floatingCards');
  const bars = [46, 72, 38, 84, 58];

  return (
    <div className="pointer-events-none absolute top-6 right-0 z-20 hidden translate-x-1/2 space-y-3 lg:block">
      <FloatingCard
        accent="border-dynamic-purple/25"
        className="w-52"
        delay="-1.2s"
      >
        <CardLabel accent="text-dynamic-purple" icon={Sparkles} live>
          {t('aiCard.title')}
        </CardLabel>

        <p className="text-foreground/60 text-xs leading-relaxed">
          {t('aiCard.message')}
        </p>

        {/* The action the reply is offering. */}
        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-dynamic-purple/25 bg-dynamic-purple/10 px-2 py-1">
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-dynamic-purple"
          />
          <span className="font-mono-ui text-[0.55rem] text-dynamic-purple/90 uppercase tracking-[0.14em]">
            {t('aiCard.action')}
          </span>
        </div>
      </FloatingCard>

      <FloatingCard
        accent="border-dynamic-cyan/25"
        className="mr-10 w-44"
        delay="-3.8s"
      >
        <CardLabel accent="text-dynamic-cyan" icon={Timer}>
          {t('trackCard.title')}
        </CardLabel>

        <div className="font-display font-semibold text-2xl text-dynamic-cyan tabular-nums tracking-[-0.03em]">
          {t('trackCard.value')}
        </div>

        <div aria-hidden className="mt-2 flex h-7 items-end gap-1">
          {bars.map((height, index) => (
            <span
              className={cn(
                'flex-1 rounded-[2px]',
                index === bars.length - 2
                  ? 'bg-dynamic-cyan/70'
                  : 'bg-dynamic-cyan/25'
              )}
              key={`bar-${index}`}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>

        <p className="mt-1.5 font-mono-ui text-[0.58rem] text-foreground/45 uppercase tracking-[0.14em]">
          {t('trackCard.period')}
        </p>
      </FloatingCard>
    </div>
  );
}
