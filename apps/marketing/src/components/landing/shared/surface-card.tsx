import { ArrowUpRight } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType, ReactNode } from 'react';

export type SurfaceAccent =
  | 'blue'
  | 'green'
  | 'purple'
  | 'cyan'
  | 'orange'
  | 'pink'
  | 'red'
  | 'yellow';

/** Static triples — Tailwind cannot resolve a class built at runtime. */
const accents: Record<
  SurfaceAccent,
  { icon: string; rule: string; bloom: string }
> = {
  blue: {
    icon: 'text-dynamic-blue',
    rule: 'via-dynamic-blue/45',
    bloom: 'bg-dynamic-blue/20',
  },
  green: {
    icon: 'text-dynamic-green',
    rule: 'via-dynamic-green/45',
    bloom: 'bg-dynamic-green/20',
  },
  purple: {
    icon: 'text-dynamic-purple',
    rule: 'via-dynamic-purple/45',
    bloom: 'bg-dynamic-purple/20',
  },
  cyan: {
    icon: 'text-dynamic-cyan',
    rule: 'via-dynamic-cyan/45',
    bloom: 'bg-dynamic-cyan/20',
  },
  orange: {
    icon: 'text-dynamic-orange',
    rule: 'via-dynamic-orange/45',
    bloom: 'bg-dynamic-orange/20',
  },
  pink: {
    icon: 'text-dynamic-pink',
    rule: 'via-dynamic-pink/45',
    bloom: 'bg-dynamic-pink/20',
  },
  red: {
    icon: 'text-dynamic-red',
    rule: 'via-dynamic-red/45',
    bloom: 'bg-dynamic-red/20',
  },
  yellow: {
    icon: 'text-dynamic-yellow',
    rule: 'via-dynamic-yellow/45',
    bloom: 'bg-dynamic-yellow/20',
  },
};

interface SurfaceCardProps {
  accent: SurfaceAccent;
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  description: ReactNode;
  /** Small mono label above the title (a role, a category). */
  eyebrow?: ReactNode;
  /** Renders the card as a link and reveals a corner arrow. */
  href?: string;
  /** Opens the link in a new tab — used for apps on their own domain. */
  external?: boolean;
  /** `stack` puts the icon above the copy; `inline` places it alongside. */
  layout?: 'stack' | 'inline';
  size?: 'md' | 'lg';
  className?: string;
}

/**
 * The landing page's card surface.
 *
 * Outcomes, AI systems and the secondary app tiles were each carrying their own
 * copy of the same treatment — border, lit top edge, corner bloom, hover lift.
 * Keeping it in one place means the language is enforced rather than
 * re-typed, and a change to the surface lands everywhere at once.
 */
export function SurfaceCard({
  accent,
  icon: Icon,
  title,
  description,
  eyebrow,
  href,
  external,
  layout = 'stack',
  size = 'md',
  className,
}: SurfaceCardProps) {
  const styles = accents[accent];
  const Root = href ? 'a' : 'div';
  const isLarge = size === 'lg';

  return (
    <Root
      {...(href ? { href } : {})}
      {...(href && external
        ? { target: '_blank', rel: 'noopener noreferrer' }
        : {})}
      className={cn(
        'group relative flex h-full overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] transition-all duration-500',
        'hover:-translate-y-1 hover:border-foreground/15 hover:bg-foreground/[0.03]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        layout === 'inline' ? 'items-start gap-3 p-4' : 'flex-col',
        layout === 'stack' && (isLarge ? 'p-6 sm:p-7' : 'p-5'),
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent to-transparent transition-opacity duration-500 group-hover:opacity-100',
          layout === 'inline' ? 'opacity-0' : 'opacity-40',
          styles.rule
        )}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-100',
          styles.bloom
        )}
      />

      {layout === 'inline' ? (
        <span
          className={cn(
            'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/[0.03] transition-transform duration-500 group-hover:scale-105',
            styles.icon
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      ) : (
        <Icon
          className={cn(
            'relative transition-transform duration-500 group-hover:scale-110',
            isLarge ? 'h-5 w-5' : 'h-4 w-4',
            styles.icon
          )}
        />
      )}

      <span className={cn('relative min-w-0', layout === 'inline' && 'flex-1')}>
        {eyebrow ? (
          <span
            className={cn(
              'block font-mono-ui text-[0.6rem] uppercase tracking-[0.18em]',
              layout === 'stack' && 'mt-4',
              styles.icon
            )}
          >
            {eyebrow}
          </span>
        ) : null}

        <span
          className={cn(
            'flex items-center gap-1.5 font-display font-semibold tracking-[-0.01em]',
            layout === 'stack' && !eyebrow && (isLarge ? 'mt-5' : 'mt-4'),
            eyebrow && 'mt-1.5',
            isLarge ? 'text-xl sm:text-2xl' : 'text-[0.95rem]'
          )}
        >
          {title}
          {href ? (
            <ArrowUpRight className="h-3 w-3 shrink-0 text-foreground/25 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground/50" />
          ) : null}
        </span>

        <span
          className={cn(
            'mt-2 block text-foreground/50 leading-relaxed',
            isLarge ? 'max-w-md text-sm' : 'text-xs'
          )}
        >
          {description}
        </span>
      </span>
    </Root>
  );
}
