import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

interface DashboardCardProps {
  /** Stable id used for the heading and for layout regression selectors. */
  id: string;
  title: ReactNode;
  /** Short secondary label next to the title, such as a count. */
  meta?: ReactNode;
  actions?: ReactNode;
  /** Visually hide the title when the card content already names itself. */
  hideTitle?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Card shell for the workspace overview. It is its own size container so its
 * content adapts to the card's width, not to the viewport.
 */
export function DashboardCard({
  id,
  title,
  meta,
  actions,
  hideTitle,
  className,
  children,
}: DashboardCardProps) {
  const headingId = `dashboard-card-${id}`;
  return (
    <section
      aria-labelledby={headingId}
      data-dashboard-card={id}
      className={cn(
        '@container/card min-w-0 rounded-xl border bg-card text-card-foreground',
        className
      )}
    >
      {hideTitle ? (
        <h2 id={headingId} className="sr-only">
          {title}
        </h2>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-4 pb-2">
          <h2
            id={headingId}
            className="min-w-0 break-words font-semibold text-sm"
          >
            {title}
          </h2>
          {meta ? (
            <span className="whitespace-nowrap text-muted-foreground text-xs">
              {meta}
            </span>
          ) : null}
          {actions ? (
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {actions}
            </div>
          ) : null}
        </div>
      )}
      <div className={cn('min-w-0', hideTitle ? '' : 'px-4 pb-4')}>
        {children}
      </div>
    </section>
  );
}
