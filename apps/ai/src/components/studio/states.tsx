import { AlertCircle, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType, ReactNode } from 'react';

export function StudioEmptyState({
  action,
  className,
  description,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  className?: string;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center',
        className
      )}
    >
      {Icon ? <Icon className="size-5 text-muted-foreground" /> : null}
      <p className="font-medium text-sm">{title}</p>
      {description ? (
        <p className="max-w-md text-muted-foreground text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function StudioErrorState({
  className,
  description,
  onRetry,
  retryLabel,
  title,
}: {
  className?: string;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel: string;
  title: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 p-4',
        className
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-dynamic-red" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{title}</p>
        {description ? (
          <p className="mt-0.5 text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          <RefreshCw className="mr-2 size-3.5" />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function StudioSkeletonRows({
  className,
  count = 4,
  label,
  rowClassName = 'h-14',
}: {
  className?: string;
  count?: number;
  label: string;
  rowClassName?: string;
}) {
  return (
    <div
      aria-label={label}
      className={cn('space-y-2', className)}
      role="status"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          className={cn(
            'animate-pulse rounded-lg bg-foreground/5',
            rowClassName
          )}
          key={index}
        />
      ))}
    </div>
  );
}
