import type { ComponentProps, ReactNode } from 'react';

const joinClassNames = (...classNames: (string | undefined)[]) =>
  classNames.filter(Boolean).join(' ');

export function SolutionBadge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={joinClassNames(
        'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-transparent bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground text-xs transition-[color,box-shadow]',
        className
      )}
      {...props}
    />
  );
}

export function SolutionCard({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={joinClassNames(
        'rounded-xl border bg-card text-card-foreground shadow-sm',
        className
      )}
      {...props}
    />
  );
}

export function SolutionGradientHeadline({
  title,
  children,
  className,
}: {
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={joinClassNames(
        'bg-linear-to-r from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-clip-text py-1 text-transparent',
        className
      )}
    >
      {title || children}
    </span>
  );
}

export function SolutionLinkButton({
  className,
  variant = 'default',
  ...props
}: ComponentProps<'a'> & { variant?: 'default' | 'outline' }) {
  return (
    <a
      className={joinClassNames(
        'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md px-8 font-medium text-sm shadow-sm transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50',
        variant === 'outline'
          ? 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          : 'bg-primary text-primary-foreground hover:bg-primary/90',
        className
      )}
      {...props}
    />
  );
}
