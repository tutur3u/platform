import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

export interface OpsSectionProps {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Item count shown beside the title; null renders nothing. */
  count?: number | null;
  id?: string;
  /** Removes body padding for full-bleed tables. */
  flush?: boolean;
  title: ReactNode;
}

export function OpsSection({
  actions,
  children,
  className,
  count,
  flush = false,
  id,
  title,
}: OpsSectionProps) {
  const headingId = id ? `${id}-heading` : undefined;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'min-w-0 overflow-hidden rounded-lg border border-border bg-background',
        className
      )}
      id={id}
    >
      <div className="flex min-h-12 items-center justify-between gap-3 border-border border-b px-4 py-2">
        <h2
          className="flex items-center gap-2 font-semibold text-sm"
          id={headingId}
        >
          {title}
          {typeof count === 'number' ? (
            <span className="rounded-full bg-foreground/5 px-2 py-0.5 font-medium text-muted-foreground text-xs tabular-nums">
              {count}
            </span>
          ) : null}
        </h2>
        {actions ? (
          <div className="flex items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className={cn(!flush && 'p-4')}>{children}</div>
    </section>
  );
}
