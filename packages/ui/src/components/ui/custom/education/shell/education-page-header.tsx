import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

interface EducationPageHeaderProps {
  badge?: ReactNode;
  className?: string;
  description?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  title: ReactNode;
}

export function EducationPageHeader({
  badge,
  className,
  description,
  primaryAction,
  secondaryAction,
  title,
}: EducationPageHeaderProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[1.75rem] border border-border/70 bg-card/95 p-5 shadow-sm sm:p-6',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 -left-8 h-40 w-40 rounded-full bg-dynamic-blue/10 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-40 w-40 rounded-full bg-dynamic-green/10 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-foreground/15 to-transparent" />
      </div>

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          {badge ? <div>{badge}</div> : null}
          <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-3xl text-base text-foreground/70 leading-7">
              {description}
            </p>
          ) : null}
        </div>

        {(primaryAction || secondaryAction) && (
          <div className="flex flex-wrap items-center gap-2">
            {secondaryAction}
            {primaryAction}
          </div>
        )}
      </div>
    </section>
  );
}
