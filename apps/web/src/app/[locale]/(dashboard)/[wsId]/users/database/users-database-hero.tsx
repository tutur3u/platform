import { Database } from '@tuturuuu/icons';
import type { ReactNode } from 'react';

interface UsersDatabaseHeroProps {
  title: string;
  description: string;
  primaryAction?: ReactNode;
  quickActions?: ReactNode;
  stats?: ReactNode;
}

/**
 * Custom gradient hero for the Users Database page. Presentational only: action
 * triggers (create user, repair links, duplicates) and the streamed stats row
 * are slotted in by the page so permission logic stays in one place.
 */
export function UsersDatabaseHero({
  title,
  description,
  primaryAction,
  quickActions,
  stats,
}: UsersDatabaseHeroProps) {
  return (
    <section className="relative mb-6 overflow-hidden rounded-[28px] border border-border/60 bg-linear-to-br from-dynamic-blue/10 via-background to-dynamic-purple/10 p-5 shadow-sm sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-dynamic-blue/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-background/70 text-dynamic-blue shadow-sm">
              <Database className="h-6 w-6" />
            </span>
            <div className="space-y-1">
              <h1 className="font-bold text-2xl tracking-tight sm:text-3xl">
                {title}
              </h1>
              <p className="max-w-2xl text-pretty text-muted-foreground text-sm">
                {description}
              </p>
            </div>
          </div>
          {primaryAction ? (
            <div className="flex shrink-0 items-center gap-2">
              {primaryAction}
            </div>
          ) : null}
        </div>

        {quickActions ? (
          <div className="flex flex-wrap items-center gap-2">
            {quickActions}
          </div>
        ) : null}

        {stats ? <div>{stats}</div> : null}
      </div>
    </section>
  );
}
