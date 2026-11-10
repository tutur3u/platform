import { cn } from '@tuturuuu/utils/format';
import type { ComponentType, ReactNode } from 'react';
import { HeroAtmosphere } from '@/components/landing/shared/atmosphere';

export type HeroAccent =
  | 'blue'
  | 'purple'
  | 'green'
  | 'cyan'
  | 'orange'
  | 'pink'
  | 'red'
  | 'yellow';

// Static maps: Tailwind cannot resolve a class assembled at runtime. The pages
// this replaces built `text-dynamic-${color}` by interpolation, so none of
// their accents ever reached the stylesheet.
const accents: Record<HeroAccent, { text: string; chip: string }> = {
  blue: {
    text: 'text-dynamic-blue',
    chip: 'border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue',
  },
  purple: {
    text: 'text-dynamic-purple',
    chip: 'border-dynamic-purple/25 bg-dynamic-purple/10 text-dynamic-purple',
  },
  green: {
    text: 'text-dynamic-green',
    chip: 'border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green',
  },
  cyan: {
    text: 'text-dynamic-cyan',
    chip: 'border-dynamic-cyan/25 bg-dynamic-cyan/10 text-dynamic-cyan',
  },
  orange: {
    text: 'text-dynamic-orange',
    chip: 'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange',
  },
  pink: {
    text: 'text-dynamic-pink',
    chip: 'border-dynamic-pink/25 bg-dynamic-pink/10 text-dynamic-pink',
  },
  red: {
    text: 'text-dynamic-red',
    chip: 'border-dynamic-red/25 bg-dynamic-red/10 text-dynamic-red',
  },
  yellow: {
    text: 'text-dynamic-yellow',
    chip: 'border-dynamic-yellow/25 bg-dynamic-yellow/10 text-dynamic-yellow',
  },
};

interface PageHeroProps {
  eyebrow: string;
  eyebrowIcon?: ComponentType<{ className?: string }>;
  /** Rendered before the highlight; keep it short. */
  title: ReactNode;
  /** Picked out in the accent colour. */
  highlight?: ReactNode;
  /** Rendered after the highlight. */
  titleSuffix?: ReactNode;
  description?: ReactNode;
  accent?: HeroAccent;
  actions?: ReactNode;
  /** Optional composition below the copy — a diagram, a stat rail, a figure. */
  children?: ReactNode;
  className?: string;
}

/**
 * One opening for every marketing page.
 *
 * The seven pages this serves each carried their own hero: different padding,
 * different type scale, three separate hand-rolled badge components, and in
 * four cases a `motion.div` per element purely to fade text in. Sharing the
 * shell means arriving from the landing page feels like the same site, and the
 * entrance is CSS rather than a motion runtime.
 */
export function PageHero({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  highlight,
  titleSuffix,
  description,
  accent = 'purple',
  actions,
  children,
  className,
}: PageHeroProps) {
  const styles = accents[accent];

  return (
    <section
      className={cn(
        'relative overflow-hidden px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:px-8 lg:pt-36',
        className
      )}
    >
      <HeroAtmosphere />

      <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        <span
          className={cn(
            'inline-flex animate-rise-in items-center gap-2 rounded-full border py-1.5 pr-4 pl-2.5 font-mono-ui text-[0.65rem] uppercase tracking-[0.2em] backdrop-blur-md',
            styles.chip
          )}
        >
          {EyebrowIcon ? <EyebrowIcon className="h-3.5 w-3.5" /> : null}
          {eyebrow}
        </span>

        <h1
          className="mt-8 animate-rise-in text-balance font-display font-extrabold text-4xl leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl"
          style={{ animationDelay: '90ms' }}
        >
          {title}
          {highlight ? (
            <>
              {' '}
              <span className={styles.text}>{highlight}</span>
            </>
          ) : null}
          {titleSuffix ? <> {titleSuffix}</> : null}
        </h1>

        {description ? (
          <p
            className="mt-6 max-w-2xl animate-rise-in text-balance text-base text-foreground/55 leading-relaxed sm:text-lg"
            style={{ animationDelay: '180ms' }}
          >
            {description}
          </p>
        ) : null}

        {actions ? (
          <div
            className="mt-9 flex w-full animate-rise-in flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row [&>a]:w-full sm:[&>a]:w-auto"
            style={{ animationDelay: '270ms' }}
          >
            {actions}
          </div>
        ) : null}
      </div>

      {children ? (
        <div
          className="relative mx-auto mt-16 w-full max-w-5xl animate-rise-in"
          style={{ animationDelay: '360ms' }}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
