'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { MiraMark } from './mira-mark';

/** Static class strings per dynamic color so Tailwind keeps every variant. */
export const ARENA_COLORS = [
  {
    chip: 'bg-dynamic-blue/10 text-dynamic-blue',
    ring: 'ring-dynamic-blue/45',
    bar: 'bg-dynamic-blue',
  },
  {
    chip: 'bg-dynamic-teal/10 text-dynamic-teal',
    ring: 'ring-dynamic-teal/45',
    bar: 'bg-dynamic-teal',
  },
  {
    chip: 'bg-dynamic-orange/10 text-dynamic-orange',
    ring: 'ring-dynamic-orange/45',
    bar: 'bg-dynamic-orange',
  },
  {
    chip: 'bg-dynamic-pink/10 text-dynamic-pink',
    ring: 'ring-dynamic-pink/45',
    bar: 'bg-dynamic-pink',
  },
  {
    chip: 'bg-dynamic-green/10 text-dynamic-green',
    ring: 'ring-dynamic-green/45',
    bar: 'bg-dynamic-green',
  },
  {
    chip: 'bg-dynamic-red/10 text-dynamic-red',
    ring: 'ring-dynamic-red/45',
    bar: 'bg-dynamic-red',
  },
  {
    chip: 'bg-dynamic-purple/10 text-dynamic-purple',
    ring: 'ring-dynamic-purple/45',
    bar: 'bg-dynamic-purple',
  },
  {
    chip: 'bg-dynamic-yellow/10 text-dynamic-yellow',
    ring: 'ring-dynamic-yellow/45',
    bar: 'bg-dynamic-yellow',
  },
  {
    chip: 'bg-dynamic-cyan/10 text-dynamic-cyan',
    ring: 'ring-dynamic-cyan/45',
    bar: 'bg-dynamic-cyan',
  },
  {
    chip: 'bg-dynamic-indigo/10 text-dynamic-indigo',
    ring: 'ring-dynamic-indigo/45',
    bar: 'bg-dynamic-indigo',
  },
  {
    chip: 'bg-dynamic-sky/10 text-dynamic-sky',
    ring: 'ring-dynamic-sky/45',
    bar: 'bg-dynamic-sky',
  },
  {
    chip: 'bg-dynamic-lime/10 text-dynamic-lime',
    ring: 'ring-dynamic-lime/45',
    bar: 'bg-dynamic-lime',
  },
] as const;

export const arenaColor = (index: number) =>
  ARENA_COLORS[
    ((index % ARENA_COLORS.length) + ARENA_COLORS.length) % ARENA_COLORS.length
  ]!;

/** Stable color from an ID, for players without a team. */
export function colorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return arenaColor(Math.abs(hash));
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  const letters =
    parts.length > 1
      ? `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}`
      : (parts[0]?.slice(0, 2) ?? '');
  return letters.toLocaleUpperCase() || '?';
}

export function Swatch({
  label,
  color,
  className,
}: {
  label: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-lg font-extrabold text-xs',
        color,
        className
      )}
    >
      {initials(label)}
    </span>
  );
}

export function Pill({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full px-3 font-bold text-xs [&_svg]:size-3.5 [&_svg]:shrink-0',
        className ?? 'bg-muted text-foreground'
      )}
    >
      {children}
    </span>
  );
}

/** Mira's live tag on whatever she is acting on, such as a picked tile. */
export function MiraLiveTag({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'pointer-events-none inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[10px_10px_10px_3px] bg-dynamic-purple py-0 pr-2 pl-0.5 font-extrabold text-xs text-background',
        className
      )}
    >
      <MiraMark size={14} className="rounded-sm" />
      {label}
    </span>
  );
}

/** Live status pill; the pulse becomes a static ring under reduced motion. */
export function MiraStatus({ children }: { children: ReactNode }) {
  return (
    <span
      role="status"
      className="inline-flex min-h-7 min-w-0 max-w-full items-center gap-2 rounded-full border border-dynamic-purple/25 bg-dynamic-purple/10 py-1 pr-3 pl-1.5 font-extrabold text-dynamic-purple text-xs"
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full bg-dynamic-purple motion-safe:animate-pulse motion-reduce:border-2 motion-reduce:border-dynamic-purple motion-reduce:bg-transparent"
      />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** Attribution for content Mira produced. */
export function MiraAttribution({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6.5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-dynamic-purple/30 bg-card pr-2.5 pl-1 font-extrabold text-xs text-dynamic-purple',
        className
      )}
    >
      <MiraMark size={18} className="rounded-md" />
      {label}
    </span>
  );
}
