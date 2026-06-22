import type { ComponentProps } from 'react';

export const joinClassNames = (...classNames: (false | string | undefined)[]) =>
  classNames.filter(Boolean).join(' ');

export function PartnersCard({ className, ...props }: ComponentProps<'div'>) {
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

export function PartnersLinkButton({
  className,
  variant = 'default',
  ...props
}: ComponentProps<'a'> & { variant?: 'default' | 'outline' }) {
  return (
    <a
      className={joinClassNames(
        'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md px-8 font-medium text-sm shadow-xs transition-[color,box-shadow] hover:scale-105',
        variant === 'outline'
          ? 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          : 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        className
      )}
      {...props}
    />
  );
}

export function PartnersBadge({ children, className }: ComponentProps<'div'>) {
  return (
    <div
      className={joinClassNames(
        'inline-flex items-center gap-2 rounded-full border px-4 py-2 font-medium text-sm backdrop-blur-sm transition-all hover:scale-105',
        className
      )}
    >
      {children}
    </div>
  );
}
