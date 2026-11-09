'use client';

import { ArrowRight, type LucideIcon } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Shared chrome for the interactive demo section.
 *
 * Every panel inside `DemoTabs` is built from these primitives so the five
 * demos read as five views of one product rather than five unrelated mockups:
 * the same frame, the same micro-label typography, the same motion timing.
 *
 * Colour is expressed only through dynamic tokens, and every class name is
 * resolved from a static lookup map — never interpolated — so Tailwind can see
 * it.
 */

export type DemoAccent = 'green' | 'blue' | 'orange' | 'purple' | 'cyan';

interface AccentStyles {
  /** Solid accent text. */
  text: string;
  /** Solid accent fill (dots, carets, bars). */
  fill: string;
  /** Low-opacity accent wash for surfaces. */
  wash: string;
  /** Hairline accent border. */
  border: string;
  /** `via-*` stop for the lit top edge of a frame. */
  rule: string;
  /** Blurred corner bloom. */
  bloom: string;
  /** Focus/selection ring. */
  ring: string;
  /** Left rail on list rows. */
  rail: string;
}

export const demoAccents: Record<DemoAccent, AccentStyles> = {
  green: {
    text: 'text-dynamic-green',
    fill: 'bg-dynamic-green',
    wash: 'bg-dynamic-green/10',
    border: 'border-dynamic-green/25',
    rule: 'via-dynamic-green/50',
    bloom: 'bg-dynamic-green/20',
    ring: 'ring-dynamic-green/30',
    rail: 'border-l-dynamic-green',
  },
  blue: {
    text: 'text-dynamic-blue',
    fill: 'bg-dynamic-blue',
    wash: 'bg-dynamic-blue/10',
    border: 'border-dynamic-blue/25',
    rule: 'via-dynamic-blue/50',
    bloom: 'bg-dynamic-blue/20',
    ring: 'ring-dynamic-blue/30',
    rail: 'border-l-dynamic-blue',
  },
  orange: {
    text: 'text-dynamic-orange',
    fill: 'bg-dynamic-orange',
    wash: 'bg-dynamic-orange/10',
    border: 'border-dynamic-orange/25',
    rule: 'via-dynamic-orange/50',
    bloom: 'bg-dynamic-orange/20',
    ring: 'ring-dynamic-orange/30',
    rail: 'border-l-dynamic-orange',
  },
  purple: {
    text: 'text-dynamic-purple',
    fill: 'bg-dynamic-purple',
    wash: 'bg-dynamic-purple/10',
    border: 'border-dynamic-purple/25',
    rule: 'via-dynamic-purple/50',
    bloom: 'bg-dynamic-purple/20',
    ring: 'ring-dynamic-purple/30',
    rail: 'border-l-dynamic-purple',
  },
  cyan: {
    text: 'text-dynamic-cyan',
    fill: 'bg-dynamic-cyan',
    wash: 'bg-dynamic-cyan/10',
    border: 'border-dynamic-cyan/25',
    rule: 'via-dynamic-cyan/50',
    bloom: 'bg-dynamic-cyan/20',
    ring: 'ring-dynamic-cyan/30',
    rail: 'border-l-dynamic-cyan',
  },
};

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Panel-level entrance. Children declared with `DemoItem` fall in behind it.
 */
export function DemoPane({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      animate="visible"
      className={cn('space-y-4', className)}
      exit="exit"
      initial="hidden"
      variants={{
        hidden: { opacity: 0, y: reduced ? 0 : 8 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: reduced ? 0.15 : 0.4,
            ease: EASE,
            staggerChildren: reduced ? 0 : 0.055,
            delayChildren: reduced ? 0 : 0.04,
          },
        },
        exit: {
          opacity: 0,
          y: reduced ? 0 : -8,
          transition: { duration: 0.18, ease: 'easeIn' },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function DemoItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: reduced ? 0 : 12 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: reduced ? 0.15 : 0.5, ease: EASE },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/** Tracked monospace micro-label — the section's smallest typographic unit. */
export function DemoLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'font-mono-ui text-[0.6rem] uppercase leading-none tracking-[0.18em]',
        className
      )}
    >
      {children}
    </span>
  );
}

/** Accent status dot with a soft pulsing halo. */
export function DemoPulse({
  accent,
  className,
}: {
  accent: DemoAccent;
  className?: string;
}) {
  const styles = demoAccents[accent];

  return (
    <span className={cn('relative flex h-1.5 w-1.5', className)}>
      <span
        aria-hidden
        className={cn(
          'absolute inset-0 animate-ring-pulse rounded-full opacity-70 motion-reduce:animate-none',
          styles.fill
        )}
      />
      <span className={cn('relative h-1.5 w-1.5 rounded-full', styles.fill)} />
    </span>
  );
}

/**
 * Product frame: window chrome (dots, path, live meta) around a demo surface.
 */
export function DemoFrame({
  accent,
  icon: Icon,
  label,
  meta,
  children,
  bodyClassName,
  className,
}: {
  accent: DemoAccent;
  icon?: LucideIcon;
  label: string;
  meta?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  const styles = demoAccents[accent];

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] shadow-foreground/5 shadow-sm',
        className
      )}
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent to-transparent opacity-60 transition-opacity duration-500 group-hover:opacity-100',
          styles.rule
        )}
      />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-20 -right-16 h-44 w-44 rounded-full opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-100',
          styles.bloom
        )}
      />

      {/* No traffic lights here: the surrounding workspace shell owns the
          window chrome, so this is an inner view header only. */}
      <div className="relative flex items-center gap-3 border-foreground/[0.06] border-b bg-foreground/[0.02] px-3 py-2.5 sm:px-4">
        <span
          aria-hidden
          className={cn('h-3.5 w-0.5 rounded-full', styles.fill)}
        />
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? (
            <Icon className={cn('h-3.5 w-3.5 shrink-0', styles.text)} />
          ) : null}
          <DemoLabel className="truncate text-foreground/50">{label}</DemoLabel>
        </div>
        {meta ? (
          <div className="ml-auto flex min-w-0 items-center gap-2 text-foreground/40">
            {meta}
          </div>
        ) : null}
      </div>

      <div className={cn('relative', bodyClassName)}>{children}</div>
    </div>
  );
}

/** Panel heading: mono accent kicker over a display title. */
export function DemoHeading({
  accent,
  kicker,
  title,
  aside,
}: {
  accent: DemoAccent;
  kicker: string;
  title: string;
  aside?: ReactNode;
}) {
  const styles = demoAccents[accent];

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <DemoLabel className={styles.text}>{kicker}</DemoLabel>
        <h3 className="mt-2 font-display font-semibold text-lg tracking-[-0.02em] sm:text-xl">
          {title}
        </h3>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

/** Figure tile: mono label over a tabular value. */
export function DemoStat({
  accent,
  label,
  value,
  detail,
  className,
}: {
  accent: DemoAccent;
  label: string;
  value: string;
  detail?: ReactNode;
  className?: string;
}) {
  const styles = demoAccents[accent];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-foreground/[0.08] bg-foreground/[0.015] p-3 transition-colors duration-300 hover:bg-foreground/[0.03]',
        className
      )}
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent to-transparent',
          styles.rule
        )}
      />
      <DemoLabel className="text-foreground/40">{label}</DemoLabel>
      <div
        className={cn(
          'mt-2 font-display font-semibold text-xl tabular-nums tracking-[-0.02em]',
          styles.text
        )}
      >
        {value}
      </div>
      {detail ? (
        <div className="mt-1 text-[0.7rem] text-foreground/45">{detail}</div>
      ) : null}
    </div>
  );
}

/** Terminal-flavoured call to action closing each panel. */
export function DemoCta({
  accent,
  href = '/onboarding',
  children,
}: {
  accent: DemoAccent;
  href?: string;
  children: ReactNode;
}) {
  const styles = demoAccents[accent];

  return (
    <Link
      className={cn(
        'group/cta relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-foreground/[0.08] bg-foreground/[0.015] px-4 py-3 transition-colors duration-300 hover:bg-foreground/[0.04]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
        styles.ring
      )}
      href={href}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover/cta:opacity-100',
          styles.rule
        )}
      />
      <span className="flex items-center gap-2.5">
        <span className={cn('h-1 w-1 rounded-full', styles.fill)} />
        <DemoLabel className="text-foreground/70">{children}</DemoLabel>
      </span>
      <ArrowRight
        className={cn(
          'h-3.5 w-3.5 transition-transform duration-300 group-hover/cta:translate-x-0.5',
          styles.text
        )}
      />
    </Link>
  );
}
