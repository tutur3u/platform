import type { LucideIcon } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

export type FeatureColor =
  | 'blue'
  | 'green'
  | 'purple'
  | 'cyan'
  | 'orange'
  | 'pink';

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
};

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
  color: FeatureColor;
  /** Miniature product visual rendered above the copy. */
  preview?: ReactNode;
  /** Wide cards run the preview beside the copy instead of above it. */
  wide?: boolean;
  href?: string;
  className?: string;
}

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
        'group relative flex flex-col overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-5 transition-all duration-500',
        'hover:-translate-y-1 hover:bg-foreground/[0.03] hover:shadow-2xl hover:shadow-foreground/5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        styles.border,
        wide && 'sm:p-6',
        className
      )}
    >
      {/* Lit top edge — brightens on hover so the card reads as catching light */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent to-transparent opacity-40 transition-opacity duration-500 group-hover:opacity-100',
          styles.rule
        )}
      />
      {/* Corner bloom */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100',
          styles.bloom
        )}
      />

      <div
        className={cn(
          'relative flex',
          wide ? 'flex-col gap-4 sm:flex-row sm:items-center' : 'flex-col'
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
              'h-fit transition-transform duration-500 group-hover:-translate-y-0.5',
              wide ? 'sm:w-[44%] sm:shrink-0' : 'mt-4'
            )}
          >
            {preview}
          </div>
        ) : null}
      </div>
    </Root>
  );
}
