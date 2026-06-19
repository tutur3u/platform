import Link from 'next/link';
import type { ComponentProps } from 'react';

const joinClassNames = (...classNames: (string | undefined)[]) =>
  classNames.filter(Boolean).join(' ');

export function ProductBadge({ className, ...props }: ComponentProps<'span'>) {
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

export function ProductButton({
  className,
  ...props
}: ComponentProps<'button'>) {
  return (
    <button
      className={joinClassNames(
        'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-6 font-medium text-primary-foreground text-sm shadow-sm transition-[color,box-shadow] hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export function ProductCard({ className, ...props }: ComponentProps<'div'>) {
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

export function ProductLinkButton({
  className,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      className={joinClassNames(
        'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-6 font-medium text-sm shadow-xs transition-[color,box-shadow] hover:bg-accent hover:text-accent-foreground',
        className
      )}
      {...props}
    />
  );
}
