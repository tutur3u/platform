import { ArrowUpRight } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType, ReactNode } from 'react';
import { getMarketingAccent, type MarketingAccent } from './accents';

interface SurfaceCardProps {
  accent: MarketingAccent;
  icon?: ComponentType<{ className?: string }>;
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
  /** Extra content rendered under the description (a chip row, a mini preview). */
  footer?: ReactNode;
  className?: string;
}

/**
 * The marketing card surface: border, lit top edge, corner bloom, hover lift.
 *
 * Every feature grid, use-case tile and app link on a satellite landing page
 * routes through this, so a change to the treatment lands everywhere at once
 * instead of being re-typed per section.
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
  footer,
  className,
}: SurfaceCardProps) {
  const styles = getMarketingAccent(accent);
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

      {Icon ? (
        layout === 'inline' ? (
          <span
            className={cn(
              'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/[0.03] transition-transform duration-500 group-hover:scale-105',
              styles.text
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : (
          <Icon
            className={cn(
              'relative transition-transform duration-500 group-hover:scale-110',
              isLarge ? 'h-5 w-5' : 'h-4 w-4',
              styles.text
            )}
          />
        )
      ) : null}

      <span className={cn('relative min-w-0', layout === 'inline' && 'flex-1')}>
        {eyebrow ? (
          <span
            className={cn(
              'block font-mono-ui text-[0.6rem] uppercase tracking-[0.18em]',
              layout === 'stack' && Icon && 'mt-4',
              styles.text
            )}
          >
            {eyebrow}
          </span>
        ) : null}

        <span
          className={cn(
            'flex items-center gap-1.5 font-display font-semibold tracking-[-0.01em]',
            layout === 'stack' &&
              !eyebrow &&
              Icon &&
              (isLarge ? 'mt-5' : 'mt-4'),
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

        {footer ? <span className="relative mt-4 block">{footer}</span> : null}
      </span>
    </Root>
  );
}
