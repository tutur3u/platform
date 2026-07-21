import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { type BloomTone, SectionBloom } from './atmosphere';

interface SectionShellProps {
  id?: string;
  /** Two-digit index rendered in the rule beside the eyebrow, e.g. "02". */
  index?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Constrains the inner content. Defaults to the 6xl marketing column. */
  width?: 'default' | 'narrow' | 'wide';
  align?: 'center' | 'start';
  /** Ambient brand bloom behind the section header. */
  bloom?: BloomTone | 'none';
  /** Hairline rule across the top of the section. */
  rule?: boolean;
  className?: string;
}

const widths = {
  narrow: 'max-w-4xl',
  default: 'max-w-6xl',
  wide: 'max-w-7xl',
} as const;

/**
 * Shared vertical rhythm + header treatment for every marketing section.
 *
 * Keeps eyebrow/title/subtitle typography and section padding identical across
 * the landing page so sections read as one system instead of six variations.
 */
export function SectionShell({
  id,
  index,
  eyebrow,
  title,
  subtitle,
  children,
  width = 'default',
  align = 'center',
  bloom = 'none',
  rule = true,
  className,
}: SectionShellProps) {
  return (
    <section
      className={cn(
        'relative scroll-mt-24 px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32',
        className
      )}
      id={id}
    >
      {rule ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--foreground)_12%,transparent)_25%,color-mix(in_oklab,var(--foreground)_12%,transparent)_75%,transparent)]"
        />
      ) : null}
      {bloom === 'none' ? null : <SectionBloom tone={bloom} />}

      <div className={cn('relative mx-auto w-full', widths[width])}>
        <header
          className={cn(
            'mb-14 flex flex-col sm:mb-18',
            align === 'center' ? 'items-center text-center' : 'items-start'
          )}
        >
          {eyebrow ? (
            <SectionEyebrow index={index}>{eyebrow}</SectionEyebrow>
          ) : null}

          <h2
            className={cn(
              'mt-6 max-w-3xl text-balance font-display font-semibold text-4xl tracking-[-0.03em] sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]',
              align === 'center' && 'mx-auto'
            )}
          >
            {title}
          </h2>

          {subtitle ? (
            <p
              className={cn(
                'mt-5 max-w-xl text-balance text-base text-foreground/55 leading-relaxed sm:text-lg',
                align === 'center' && 'mx-auto'
              )}
            >
              {subtitle}
            </p>
          ) : null}
        </header>

        {children}
      </div>
    </section>
  );
}

/**
 * Micro-label above a section title: a hairline rule, an optional index, and
 * tracked monospace text. The mono face is what separates a label from a
 * heading at a glance.
 */
export function SectionEyebrow({
  children,
  index,
  className,
}: {
  children: ReactNode;
  index?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 font-mono-ui text-[0.7rem] text-foreground/45 uppercase tracking-[0.22em]',
        className
      )}
    >
      {index ? (
        <>
          <span className="text-foreground/30 tabular-nums">{index}</span>
          <span
            aria-hidden
            className="h-px w-8 bg-gradient-to-r from-foreground/25 to-transparent"
          />
        </>
      ) : null}
      <span className="flex items-center gap-1.5">{children}</span>
    </div>
  );
}

/**
 * Raised panel used to lift dense content (demos, matrices) off the page
 * substrate, with a lit top edge so it reads as a physical surface.
 */
export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl border border-foreground/10 bg-gradient-to-b from-foreground/[0.045] to-transparent',
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
      />
      {children}
    </div>
  );
}
