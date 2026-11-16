'use client';

import { ChevronRight } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

const TONES = {
  blue: 'bg-dynamic-blue/15 text-dynamic-blue',
  red: 'bg-dynamic-red/15 text-dynamic-red',
} as const;

/** A Sorbet surface card: white on the page, lifted by shadow, no border. */
export function DayCard({ children }: { children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl bg-card p-4 text-card-foreground shadow-[var(--sorbet-shadow-md,0_10px_30px_-18px_rgb(0_0_0/0.35))] sm:p-5">
      {children}
    </section>
  );
}

export function DayCardHeader({
  icon,
  tone,
  title,
  subtitle,
  href,
  linkLabel,
}: {
  icon: ReactNode;
  tone: keyof typeof TONES;
  title: string;
  subtitle?: string;
  href: string | null;
  linkLabel: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-lg',
            TONES[tone]
          )}
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="truncate font-extrabold text-base leading-tight">
            {title}
          </h3>
          {subtitle && (
            <p className="truncate font-semibold text-muted-foreground text-xs">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {href && (
        <a
          href={href}
          aria-label={linkLabel}
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-bold text-muted-foreground text-xs transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          <span className="hidden sm:inline">{linkLabel}</span>
          <ChevronRight className="size-4" />
        </a>
      )}
    </div>
  );
}

/**
 * One full-width row. The whole row is the link target (52px on touch), with
 * hairlines between rows instead of nested shadows.
 */
export function DayRowLink({
  href,
  label,
  leading,
  children,
}: {
  href: string | null;
  label: string;
  leading?: ReactNode;
  children: ReactNode;
}) {
  const body = (
    <>
      {leading}
      {children}
      {href && (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
      )}
    </>
  );
  const className =
    'group -mx-3 flex min-h-13 items-center gap-3 rounded-xl px-3 py-2 text-sm sm:min-h-12';
  return (
    <li className="border-border/70 border-t first:border-t-0">
      {href ? (
        <a
          href={href}
          aria-label={label}
          className={cn(
            className,
            'transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2'
          )}
        >
          {body}
        </a>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}
