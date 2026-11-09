import { ArrowUpRight, type LucideIcon } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

export type FeatureColor =
  | 'blue'
  | 'green'
  | 'purple'
  | 'cyan'
  | 'orange'
  | 'pink'
  | 'yellow'
  | 'red';

// Static class maps: Tailwind cannot resolve a class assembled at runtime.
const colorStyles: Record<
  FeatureColor,
  { border: string; bloom: string; icon: string; label: string; rule: string }
> = {
  blue: {
    border: 'hover:border-dynamic-blue/35',
    bloom: 'bg-dynamic-blue/25',
    icon: 'text-dynamic-blue',
    label: 'text-dynamic-blue/80',
    rule: 'via-dynamic-blue/40',
  },
  green: {
    border: 'hover:border-dynamic-green/35',
    bloom: 'bg-dynamic-green/25',
    icon: 'text-dynamic-green',
    label: 'text-dynamic-green/80',
    rule: 'via-dynamic-green/40',
  },
  purple: {
    border: 'hover:border-dynamic-purple/35',
    bloom: 'bg-dynamic-purple/25',
    icon: 'text-dynamic-purple',
    label: 'text-dynamic-purple/80',
    rule: 'via-dynamic-purple/40',
  },
  cyan: {
    border: 'hover:border-dynamic-cyan/35',
    bloom: 'bg-dynamic-cyan/25',
    icon: 'text-dynamic-cyan',
    label: 'text-dynamic-cyan/80',
    rule: 'via-dynamic-cyan/40',
  },
  orange: {
    border: 'hover:border-dynamic-orange/35',
    bloom: 'bg-dynamic-orange/25',
    icon: 'text-dynamic-orange',
    label: 'text-dynamic-orange/80',
    rule: 'via-dynamic-orange/40',
  },
  pink: {
    border: 'hover:border-dynamic-pink/35',
    bloom: 'bg-dynamic-pink/25',
    icon: 'text-dynamic-pink',
    label: 'text-dynamic-pink/80',
    rule: 'via-dynamic-pink/40',
  },
  yellow: {
    border: 'hover:border-dynamic-yellow/35',
    bloom: 'bg-dynamic-yellow/25',
    icon: 'text-dynamic-yellow',
    label: 'text-dynamic-yellow/80',
    rule: 'via-dynamic-yellow/40',
  },
  red: {
    border: 'hover:border-dynamic-red/35',
    bloom: 'bg-dynamic-red/25',
    icon: 'text-dynamic-red',
    label: 'text-dynamic-red/80',
    rule: 'via-dynamic-red/40',
  },
};

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
  color: FeatureColor;
  /** Miniature product visual rendered beside (wide) or below (narrow) the copy. */
  preview?: ReactNode;
  /** Wide cards run the preview beside the copy instead of under it. */
  wide?: boolean;
  href?: string;
  className?: string;
}

/**
 * A bento cell.
 *
 * The card always fills its grid row (`h-full`) and pins its preview to the
 * bottom, so a row of cards with different amounts of copy still lines its
 * previews up along one edge. That is what keeps the grid free of the ragged
 * holes an `items-start` layout produces.
 */
export function FeatureCard({
  icon: Icon,
  title,
  subtitle,
  description,
  color,
  preview,
  wide = false,
  href,
  className,
}: FeatureCardProps) {
  const styles = colorStyles[color];
  const Root = href ? 'a' : 'div';

  return (
    <Root
      {...(href ? { href } : {})}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-5 transition-all duration-500',
        'hover:-translate-y-1 hover:bg-foreground/[0.03] hover:shadow-2xl hover:shadow-foreground/5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        styles.border,
        wide && 'sm:p-6',
        className
      )}
    >
      {/* Lit top edge — brightens on hover so the card reads as catching light */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent to-transparent opacity-40 transition-opacity duration-500 group-hover:opacity-100',
          styles.rule
        )}
      />
      {/* Corner bloom */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100',
          styles.bloom
        )}
      />

      <div
        className={cn(
          'relative flex flex-1',
          wide ? 'flex-col gap-5 sm:flex-row sm:items-center' : 'flex-col'
        )}
      >
        <div className={cn('flex flex-col', wide && 'sm:flex-1')}>
          <div className="flex items-center gap-2.5">
            <Icon
              className={cn(
                'h-4 w-4 shrink-0 transition-transform duration-500 group-hover:scale-110',
                styles.icon
              )}
            />
            <span
              className={cn(
                'font-mono-ui text-[0.65rem] uppercase tracking-[0.18em]',
                styles.label
              )}
            >
              {subtitle}
            </span>
            {href ? (
              <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-foreground/20 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground/50" />
            ) : null}
          </div>

          <h3
            className={cn(
              'mt-3 font-display font-semibold tracking-[-0.02em]',
              wide ? 'text-2xl' : 'text-lg'
            )}
          >
            {title}
          </h3>

          <p
            className={cn(
              'mt-2 text-foreground/50 text-sm leading-relaxed',
              wide && 'max-w-sm'
            )}
          >
            {description}
          </p>
        </div>

        {preview ? (
          <div
            className={cn(
              'transition-transform duration-500 group-hover:-translate-y-0.5',
              // Wide: sits beside the copy. Narrow: pushed to the card's floor
              // so every preview in a row shares one baseline.
              wide
                ? 'sm:w-[46%] sm:shrink-0'
                : 'mt-5 pt-1 max-sm:mt-4 sm:mt-auto'
            )}
          >
            {preview}
          </div>
        ) : null}
      </div>
    </Root>
  );
}
