import { cn } from '@tuturuuu/utils/format';
import type { ComponentProps } from 'react';

type SecuritySubpageBadgeProps = ComponentProps<'span'> & {
  variant?: 'secondary';
};

export function SecuritySubpageBadge({
  className,
  variant: _variant,
  ...props
}: SecuritySubpageBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-transparent bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground text-xs transition-[color,box-shadow]',
        className
      )}
      {...props}
    />
  );
}

export function SecuritySubpageCard({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card text-card-foreground shadow-sm',
        className
      )}
      {...props}
    />
  );
}

type SecuritySubpageLinkButtonProps = ComponentProps<'a'> & {
  size?: 'lg';
  variant?: 'default' | 'outline';
};

export function SecuritySubpageLinkButton({
  className,
  size: _size,
  variant = 'default',
  ...props
}: SecuritySubpageLinkButtonProps) {
  return (
    <a
      className={cn(
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
