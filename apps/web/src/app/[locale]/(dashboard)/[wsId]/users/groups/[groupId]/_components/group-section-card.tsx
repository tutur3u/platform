import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

interface GroupSectionCardProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Accent color token, e.g. 'blue' | 'green' | 'purple'. Defaults to neutral. */
  accent?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'neutral';
}

const ACCENT_CLASSES: Record<string, string> = {
  blue: 'bg-dynamic-blue/10 text-dynamic-blue',
  green: 'bg-dynamic-green/10 text-dynamic-green',
  purple: 'bg-dynamic-purple/10 text-dynamic-purple',
  orange: 'bg-dynamic-orange/10 text-dynamic-orange',
  red: 'bg-dynamic-red/10 text-dynamic-red',
  neutral: 'bg-foreground/5 text-foreground/70',
};

/**
 * Shared, consistent section card for the user-group detail pages. Provides a
 * standardized header (accent icon chip + title + optional description + action)
 * and a flexible body.
 */
export function GroupSectionCard({
  icon,
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  accent = 'neutral',
}: GroupSectionCardProps) {
  return (
    <section
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm transition-colors hover:border-border',
        className
      )}
    >
      <header className="flex items-start justify-between gap-3 border-border/40 border-b bg-foreground/[0.015] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            <span
              className={cn(
                'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg',
                ACCENT_CLASSES[accent]
              )}
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-base leading-tight">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 truncate text-muted-foreground text-xs">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="flex-shrink-0">{action}</div> : null}
      </header>
      <div className={cn('flex flex-1 flex-col p-5', contentClassName)}>
        {children}
      </div>
    </section>
  );
}

/** Centered empty-state used inside section cards. */
export function GroupSectionEmpty({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground text-sm">
      {icon ? <div className="text-muted-foreground/50">{icon}</div> : null}
      {children}
    </div>
  );
}
