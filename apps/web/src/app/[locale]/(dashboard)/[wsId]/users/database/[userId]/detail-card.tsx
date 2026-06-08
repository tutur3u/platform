import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

export function DetailCard({
  title,
  description,
  meta,
  children,
  className,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-dynamic-border bg-card/70 p-4 shadow-sm',
        className
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-base">{title}</h2>
          {description && (
            <p className="mt-1 text-muted-foreground text-sm">{description}</p>
          )}
        </div>
        {meta}
      </div>
      {children}
    </section>
  );
}

export function EmptyPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-32 items-center justify-center rounded-lg border border-dynamic-border border-dashed bg-muted/20 px-4 text-center text-muted-foreground text-sm',
        className
      )}
    >
      {children}
    </div>
  );
}
