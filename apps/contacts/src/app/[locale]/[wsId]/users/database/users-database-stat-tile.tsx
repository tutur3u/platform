import { ChevronRight } from '@tuturuuu/icons';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface UsersDatabaseStatTileProps {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  icon: ReactNode;
  /** Tailwind dynamic accent classes, e.g. `text-dynamic-blue` */
  accentClassName?: string;
  iconWrapperClassName?: string;
  href?: string;
  actionLabel?: string;
}

/**
 * Compact metric tile used in the Users Database hero. Renders as a static card
 * or, when `href` is provided, a focusable link card with a hover affordance.
 */
export function UsersDatabaseStatTile({
  label,
  value,
  description,
  icon,
  accentClassName,
  iconWrapperClassName,
  href,
  actionLabel,
}: UsersDatabaseStatTileProps) {
  const body = (
    <Card
      className={cn(
        'group flex h-full flex-col gap-3 rounded-2xl border-border/60 bg-background/70 p-4 transition-colors',
        href && 'hover:border-border hover:bg-background'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium text-muted-foreground text-sm">
          {label}
        </span>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5',
            iconWrapperClassName
          )}
        >
          {icon}
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-1">
        <span
          className={cn('font-bold text-3xl tabular-nums', accentClassName)}
        >
          {value}
        </span>
        {description ? (
          <span className="text-muted-foreground text-sm">{description}</span>
        ) : null}
        {href && actionLabel ? (
          <span
            className={cn(
              'mt-1 inline-flex items-center gap-1 font-medium text-sm',
              accentClassName ?? 'text-foreground/70'
            )}
          >
            {actionLabel}
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        ) : null}
      </div>
    </Card>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-2xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {body}
      </Link>
    );
  }

  return body;
}
