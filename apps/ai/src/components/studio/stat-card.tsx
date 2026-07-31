import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';

export type StatTone = 'blue' | 'default' | 'green' | 'orange' | 'purple';

const TONE_CLASSES: Record<StatTone, string> = {
  blue: 'bg-dynamic-blue/10 text-dynamic-blue',
  default: 'bg-foreground/5 text-muted-foreground',
  green: 'bg-dynamic-green/10 text-dynamic-green',
  orange: 'bg-dynamic-orange/10 text-dynamic-orange',
  purple: 'bg-dynamic-purple/10 text-dynamic-purple',
};

/**
 * One number, one label, one optional supporting line. Used for every metric
 * row in the studio so tiles stay comparable across sections.
 */
export function StatCard({
  className,
  hint,
  href,
  icon: Icon,
  isLoading,
  label,
  tone = 'default',
  value,
}: {
  className?: string;
  hint?: ReactNode;
  href?: string;
  icon?: ComponentType<{ className?: string }>;
  isLoading?: boolean;
  label: string;
  tone?: StatTone;
  value: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        {Icon ? (
          <span
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-md',
              TONE_CLASSES[tone]
            )}
          >
            <Icon className="size-3.5" />
          </span>
        ) : null}
        <span className="truncate font-medium text-muted-foreground text-xs uppercase tracking-[0.06em]">
          {label}
        </span>
      </div>
      {isLoading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <div className="mt-3 font-semibold text-2xl tabular-nums tracking-tight">
          {value}
        </div>
      )}
      {hint ? (
        <div className="mt-1 truncate text-muted-foreground text-xs">
          {hint}
        </div>
      ) : null}
    </>
  );

  const shell = cn(
    'rounded-xl border bg-card p-4 transition-colors',
    href &&
      'hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
    className
  );

  return href ? (
    <Link className={cn(shell, 'block')} href={href}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

export function StatCardGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
        className
      )}
    >
      {children}
    </div>
  );
}
