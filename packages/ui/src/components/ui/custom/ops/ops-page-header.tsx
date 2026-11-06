import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

/**
 * Read-only page header for operational pages. It shares FeatureSummary's
 * surface so headers match across apps, without FeatureSummary's create and
 * settings dialog wiring (and it stays a Server Component).
 */
export interface OpsPageHeaderProps {
  /** Primary controls, aligned to the end on wide screens. */
  actions?: ReactNode;
  className?: string;
  /** Optional one-line context; omit when the title is self-explanatory. */
  description?: ReactNode;
  icon?: ReactNode;
  /** Small facts such as the snapshot time, rendered under the title. */
  meta?: ReactNode;
  title: ReactNode;
}

export function OpsPageHeader({
  actions,
  className,
  description,
  icon,
  meta,
  title,
}: OpsPageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col justify-between gap-3 rounded-lg border border-border bg-foreground/5 p-3 sm:gap-4 sm:p-4 md:flex-row md:items-center',
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground [&_svg]:size-5">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 space-y-1">
          <h1 className="truncate font-bold text-2xl">{title}</h1>
          {description ? (
            <p className="max-w-3xl text-foreground/80">{description}</p>
          ) : null}
          {meta ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
              {meta}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
