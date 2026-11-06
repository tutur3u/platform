import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { type OpsTone, opsToneClasses } from './status-tone';

export interface StatTileProps {
  className?: string;
  /** Short qualifier under the value, e.g. "of 4 lanes". */
  detail?: ReactNode;
  /** Makes the tile a link to the filtered view behind the number. */
  href?: string;
  icon?: ReactNode;
  label: ReactNode;
  tone?: OpsTone;
  /** Null renders `unknownLabel` with the unknown tone; it is never 0. */
  value: ReactNode | null;
  unknownLabel: ReactNode;
}

export function StatTile({
  className,
  detail,
  href,
  icon,
  label,
  tone = 'neutral',
  unknownLabel,
  value,
}: StatTileProps) {
  const isUnknown = value === null || value === undefined;
  const resolvedTone = isUnknown ? 'unknown' : tone;
  const classes = opsToneClasses[resolvedTone];

  const content = (
    <>
      <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
        <span className="truncate font-medium">{label}</span>
        {icon ? (
          <span className={cn('shrink-0 [&_svg]:size-4', classes.text)}>
            {icon}
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          'font-semibold text-2xl tabular-nums',
          isUnknown ? 'text-base text-muted-foreground' : 'text-foreground'
        )}
      >
        {isUnknown ? unknownLabel : value}
      </div>
      {detail ? (
        <div className="truncate text-muted-foreground text-xs">{detail}</div>
      ) : null}
    </>
  );

  const tileClassName = cn(
    'flex min-w-0 flex-col gap-1 rounded-lg border bg-background p-3',
    resolvedTone === 'neutral' ? 'border-border' : classes.border,
    href &&
      'transition-colors hover:bg-foreground/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-foreground/5',
    className
  );

  if (href) {
    return (
      <Link className={tileClassName} data-tone={resolvedTone} href={href}>
        {content}
      </Link>
    );
  }

  return (
    <div className={tileClassName} data-tone={resolvedTone}>
      {content}
    </div>
  );
}
