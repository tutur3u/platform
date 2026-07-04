import type { ComponentProps } from 'react';

export type SecurityTone =
  | 'blue'
  | 'cyan'
  | 'green'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'yellow';

export const joinClassNames = (
  ...classNames: (false | null | string | undefined)[]
) => classNames.filter(Boolean).join(' ');

export function SecurityBadge({ className, ...props }: ComponentProps<'span'>) {
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

export function SecurityCard({ className, ...props }: ComponentProps<'div'>) {
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

export function SecurityLinkButton({
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

export const toneClasses: Record<
  SecurityTone,
  {
    card: string;
    icon: string;
    iconFrame: string;
  }
> = {
  blue: {
    card: 'border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/5 via-background to-background hover:border-dynamic-blue/50 hover:shadow-dynamic-blue/10',
    icon: 'text-dynamic-blue',
    iconFrame: 'bg-dynamic-blue/10',
  },
  cyan: {
    card: 'border-dynamic-cyan/30 bg-linear-to-br from-dynamic-cyan/5 via-background to-background hover:border-dynamic-cyan/50 hover:shadow-dynamic-cyan/10',
    icon: 'text-dynamic-cyan',
    iconFrame: 'bg-dynamic-cyan/10',
  },
  green: {
    card: 'border-dynamic-green/30 bg-linear-to-br from-dynamic-green/5 via-background to-background hover:border-dynamic-green/50 hover:shadow-dynamic-green/10',
    icon: 'text-dynamic-green',
    iconFrame: 'bg-dynamic-green/10',
  },
  orange: {
    card: 'border-dynamic-orange/30 bg-linear-to-br from-dynamic-orange/5 via-background to-background hover:border-dynamic-orange/50 hover:shadow-dynamic-orange/10',
    icon: 'text-dynamic-orange',
    iconFrame: 'bg-dynamic-orange/10',
  },
  pink: {
    card: 'border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/5 via-background to-background hover:border-dynamic-pink/50 hover:shadow-dynamic-pink/10',
    icon: 'text-dynamic-pink',
    iconFrame: 'bg-dynamic-pink/10',
  },
  purple: {
    card: 'border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background hover:border-dynamic-purple/50 hover:shadow-dynamic-purple/10',
    icon: 'text-dynamic-purple',
    iconFrame: 'bg-dynamic-purple/10',
  },
  red: {
    card: 'border-dynamic-red/30 bg-linear-to-br from-dynamic-red/5 via-background to-background hover:border-dynamic-red/50 hover:shadow-dynamic-red/10',
    icon: 'text-dynamic-red',
    iconFrame: 'bg-dynamic-red/10',
  },
  yellow: {
    card: 'border-dynamic-yellow/30 bg-linear-to-br from-dynamic-yellow/5 via-background to-background hover:border-dynamic-yellow/50 hover:shadow-dynamic-yellow/10',
    icon: 'text-dynamic-yellow',
    iconFrame: 'bg-dynamic-yellow/10',
  },
};
