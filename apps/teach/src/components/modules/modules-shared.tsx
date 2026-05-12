'use client';

import {
  BookOpen,
  Flame,
  GraduationCap,
  Layers3,
  LineChart,
  Sparkles,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

// ─── Skeleton / Loading ───────────────────────────────────────────────────────

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse border-2 border-border bg-card shadow-[7px_7px_0_var(--border)]',
        className
      )}
    />
  );
}

export function ModulesLoadingState() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonBlock className="h-72" key={`skeleton-${i}`} />
      ))}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export function ModulesEmptyState({
  action,
  label,
}: {
  action?: ReactNode;
  label: string;
}) {
  return (
    <div className="border-2 border-border border-dashed bg-muted/60 p-8 text-center shadow-[8px_8px_0_var(--border)]">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border-2 border-border bg-background shadow-[4px_4px_0_var(--border)]">
        <Sparkles className="h-7 w-7" />
      </div>
      <p className="mx-auto max-w-md text-muted-foreground leading-7">{label}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// ─── Brutal Card ──────────────────────────────────────────────────────────────

export function BrutalCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        'border-2 border-border bg-card shadow-[7px_7px_0_var(--border)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[9px_9px_0_var(--border)]',
        className
      )}
    >
      {children}
    </article>
  );
}

// ─── Course themes ────────────────────────────────────────────────────────────

export const courseThemes = [
  { icon: BookOpen, surface: 'bg-dynamic-yellow/15' },
  { icon: Flame, surface: 'bg-dynamic-cyan/15' },
  { icon: LineChart, surface: 'bg-dynamic-green/15' },
  { icon: GraduationCap, surface: 'bg-dynamic-pink/15' },
  { icon: Layers3, surface: 'bg-dynamic-orange/15' },
  { icon: Sparkles, surface: 'bg-dynamic-purple/15' },
] as const;
