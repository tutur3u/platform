import { cn } from '@tuturuuu/utils/format';
import type { ComponentProps } from 'react';

/**
 * The marketing pages' link-shaped button.
 *
 * These pages are deliberately kept off `@tuturuuu/ui/button` and `next/link`
 * (the public shell compile-graph test enforces it, so the marketing bundle
 * never drags in the dashboard's primitives). Each page used to re-declare its
 * own copy of this; one shared version keeps the shapes identical instead.
 */
export type ActionVariant = 'primary' | 'ghost' | 'quiet';

const variants: Record<ActionVariant, string> = {
  primary:
    'bg-[linear-gradient(100deg,var(--purple),var(--blue))] text-white shadow-[0_8px_30px_-8px_color-mix(in_oklab,var(--purple)_70%,transparent)] hover:shadow-[0_16px_44px_-8px_color-mix(in_oklab,var(--purple)_85%,transparent)]',
  ghost:
    'border border-foreground/12 bg-background/40 text-foreground/75 backdrop-blur-md hover:border-foreground/25 hover:text-foreground',
  quiet:
    'border border-foreground/[0.08] bg-foreground/[0.02] text-foreground/60 hover:border-foreground/20 hover:text-foreground',
};

export function ActionLink({
  className,
  variant = 'primary',
  external,
  ...props
}: ComponentProps<'a'> & { variant?: ActionVariant; external?: boolean }) {
  return (
    <a
      className={cn(
        'group inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-7 font-medium transition-all duration-300 hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        variants[variant],
        className
      )}
      {...(external ? { rel: 'noopener noreferrer', target: '_blank' } : {})}
      {...props}
    />
  );
}
