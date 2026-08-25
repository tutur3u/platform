import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import type { MarketingAccent } from './accents';
import { SectionBloom } from './atmosphere';

const widths = {
  narrow: 'max-w-4xl',
  default: 'max-w-6xl',
  wide: 'max-w-7xl',
  full: 'max-w-none',
} as const;

export type SectionWidth = keyof typeof widths;

/**
 * The mono eyebrow, optionally preceded by a two-digit section index sitting in
 * its own hairline rule. Exported on its own because hero sections want the
 * label without the surrounding section chrome.
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
    <span
      className={cn(
        'inline-flex items-center gap-3 font-mono-ui text-[0.65rem] text-foreground/45 uppercase tracking-[0.24em]',
        className
      )}
    >
      {index ? (
        <>
          <span className="text-foreground/30 tabular-nums">{index}</span>
          <span aria-hidden className="h-px w-8 bg-foreground/15" />
        </>
      ) : null}
      {children}
    </span>
  );
}

interface SectionShellProps {
  id?: string;
  /** Two-digit index rendered in the rule beside the eyebrow, e.g. "02". */
  index?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Constrains the inner content. Defaults to the 6xl marketing column. */
  width?: SectionWidth;
  align?: 'center' | 'start';
  /** Ambient brand bloom behind the section header. */
  bloom?: MarketingAccent | 'none';
  /** Hairline rule across the top of the section. */
  rule?: boolean;
  /** Vertical rhythm. `tight` is for stacked sections that read as one unit. */
  spacing?: 'tight' | 'default';
  className?: string;
  headerClassName?: string;
}

/**
 * Shared vertical rhythm and header treatment for every marketing section.
 *
 * Keeps eyebrow/title/subtitle typography and section padding identical down
 * the page so sections read as one system instead of N variations.
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
  spacing = 'default',
  className,
  headerClassName,
}: SectionShellProps) {
  return (
    <section
      className={cn(
        // `isolate` is load-bearing: `SectionBloom` paints at `-z-10`, and
        // without a local stacking context it slides behind any ancestor that
        // has its own background and vanishes.
        'relative isolate scroll-mt-24 px-4 sm:px-6 lg:px-8',
        spacing === 'tight'
          ? 'py-14 sm:py-18 lg:py-20'
          : 'py-20 sm:py-28 lg:py-32',
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
            align === 'center' ? 'items-center text-center' : 'items-start',
            headerClassName
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
                'mt-5 max-w-2xl text-balance text-base text-foreground/55 leading-relaxed sm:text-lg',
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
