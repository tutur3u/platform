import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

/** A titled settings card whose rows are split by dividers. */
export function SettingsGroup({
  action,
  children,
  className,
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <section className={cn('space-y-2', className)}>
      <div className="flex items-end justify-between gap-4 px-1">
        <div className="min-w-0 space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description ? (
            <p className="text-muted-foreground text-xs">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="divide-y rounded-xl border bg-card">{children}</div>
    </section>
  );
}

/** One setting: name and description on the left, its control on the right. */
export function SettingsRow({
  children,
  className,
  description,
  htmlFor,
  label,
}: {
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  htmlFor?: string;
  label: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        {htmlFor ? (
          <label className="text-sm" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <p className="text-sm">{label}</p>
        )}
        {description ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}
