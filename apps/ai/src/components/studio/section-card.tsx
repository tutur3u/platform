import { cn } from '@tuturuuu/utils/format';
import type { ComponentType, ReactNode } from 'react';

/**
 * The one card shape used across the studio: a quiet header strip, an optional
 * action slot, and a body that can opt out of padding for tables.
 */
export function SectionCard({
  actions,
  bodyClassName,
  children,
  className,
  description,
  flush,
  footer,
  icon: Icon,
  title,
}: {
  actions?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  flush?: boolean;
  footer?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  title?: ReactNode;
}) {
  return (
    <section
      className={cn('overflow-hidden rounded-xl border bg-card', className)}
    >
      {title ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon ? (
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-background text-primary ring-1 ring-border">
                <Icon className="size-3.5" />
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 className="font-medium text-sm leading-6">{title}</h2>
              {description ? (
                <p className="mt-0.5 max-w-2xl text-muted-foreground text-xs leading-relaxed">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={cn(flush ? '' : 'p-4', bodyClassName)}>{children}</div>
      {footer}
    </section>
  );
}
