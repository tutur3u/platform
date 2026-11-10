import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

/**
 * Three ways tool sprawl actually shows up in a week.
 *
 * Each card carries its own small drawing rather than an icon, because the
 * symptoms are structural — a duplicate, a broken link, a human relay — and a
 * shape says that faster than a glyph does.
 */

type SymptomTone = 'red' | 'orange' | 'yellow';

const tones: Record<
  SymptomTone,
  { rule: string; bloom: string; text: string }
> = {
  red: {
    rule: 'via-dynamic-red/45',
    bloom: 'bg-dynamic-red/20',
    text: 'text-dynamic-red/80',
  },
  orange: {
    rule: 'via-dynamic-orange/45',
    bloom: 'bg-dynamic-orange/20',
    text: 'text-dynamic-orange/80',
  },
  yellow: {
    rule: 'via-dynamic-yellow/45',
    bloom: 'bg-dynamic-yellow/20',
    text: 'text-dynamic-yellow/80',
  },
};

export function SymptomCard({
  index,
  title,
  description,
  tone,
  figure,
}: {
  index: string;
  title: string;
  description: string;
  tone: SymptomTone;
  figure: ReactNode;
}) {
  const styles = tones[tone];

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-5 transition-all duration-500 hover:-translate-y-1 hover:border-foreground/15 hover:bg-foreground/[0.03]">
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent to-transparent opacity-50 transition-opacity duration-500 group-hover:opacity-100',
          styles.rule
        )}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100',
          styles.bloom
        )}
      />

      <span
        className={cn(
          'relative font-mono-ui text-[0.62rem] tabular-nums tracking-[0.2em]',
          styles.text
        )}
      >
        {index}
      </span>

      <h3 className="relative mt-3 text-balance font-display font-semibold text-lg tracking-[-0.02em]">
        {title}
      </h3>
      <p className="relative mt-2 text-foreground/50 text-sm leading-relaxed">
        {description}
      </p>

      {/* Drawing sits on the card's floor so all three line up across the row. */}
      <div
        aria-hidden
        className="relative mt-6 flex h-20 items-center justify-center sm:mt-auto sm:pt-6"
      >
        {figure}
      </div>
    </div>
  );
}

/** One task, entered four times, none of them agreeing. */
export function DuplicateFigure() {
  const copies = [
    { x: 0, y: 0, rotate: -4, opacity: 'opacity-30' },
    { x: 10, y: 6, rotate: 3, opacity: 'opacity-45' },
    { x: 20, y: 12, rotate: -2, opacity: 'opacity-65' },
    { x: 30, y: 18, rotate: 5, opacity: 'opacity-100' },
  ];

  return (
    // Sized to the stack itself (widest copy + its offset) so the parent's
    // `justify-center` actually centres the drawing.
    <div className="relative h-full w-[8.5rem]">
      {copies.map((copy, index) => (
        <span
          className={cn(
            'absolute top-0 left-0 w-24 rounded-md border border-foreground/12 bg-background/80 p-1.5 shadow-foreground/5 shadow-sm',
            copy.opacity,
            index === copies.length - 1 && 'border-dynamic-red/35'
          )}
          key={`copy-${index}`}
          style={{
            transform: `translate(${copy.x}px, ${copy.y}px) rotate(${copy.rotate}deg)`,
          }}
        >
          <span className="block h-1 w-4/5 rounded-full bg-foreground/25" />
          <span className="mt-1 block h-1 w-1/2 rounded-full bg-foreground/12" />
        </span>
      ))}
    </div>
  );
}

/** Two systems holding the same fact, with nothing carrying the update. */
export function StaleFigure() {
  return (
    <div className="flex w-full items-center justify-center gap-1">
      <span className="flex h-12 w-12 shrink-0 flex-col justify-center gap-1 rounded-lg border border-foreground/12 bg-background/70 p-2">
        <span className="h-1 w-full rounded-full bg-dynamic-green/50" />
        <span className="h-1 w-2/3 rounded-full bg-foreground/15" />
      </span>

      {/* The link that does not exist */}
      <span className="flex flex-1 items-center">
        <span className="h-px flex-1 bg-foreground/15" />
        <span className="mx-1 flex h-4 w-4 items-center justify-center rounded-full border border-dynamic-orange/40 bg-background">
          <span className="h-2 w-px rotate-45 bg-dynamic-orange/80" />
          <span className="-ml-px h-2 w-px -rotate-45 bg-dynamic-orange/80" />
        </span>
        <span
          className="h-px flex-1"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, color-mix(in oklab, var(--foreground) 18%, transparent) 0 3px, transparent 3px 6px)',
          }}
        />
      </span>

      <span className="flex h-12 w-12 shrink-0 flex-col justify-center gap-1 rounded-lg border border-dynamic-orange/25 bg-background/70 p-2">
        <span className="h-1 w-full rounded-full bg-dynamic-orange/40" />
        <span className="h-1 w-2/3 rounded-full bg-foreground/10" />
      </span>
    </div>
  );
}

/** Every tool wired through one person, because there is no other wire. */
export function GlueFigure() {
  const spokes = [-70, -35, 0, 35, 70];

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <svg
        className="absolute inset-0 h-full w-full"
        fill="none"
        viewBox="0 0 160 80"
      >
        <title>Tools routed through one person</title>
        {spokes.map((offset) => (
          <path
            d={`M${80 + offset} 12 C ${80 + offset} 40, 80 40, 80 60`}
            key={`spoke-${offset}`}
            stroke="color-mix(in oklab, var(--foreground) 16%, transparent)"
            strokeWidth="1"
          />
        ))}
      </svg>

      {/* The tools, along the top */}
      <span className="absolute inset-x-0 top-0 flex items-start justify-center gap-3.5">
        {spokes.map((offset, index) => (
          <span
            className={cn(
              'h-4 w-4 rounded-[4px] border border-foreground/12',
              index % 2 === 0 ? 'bg-foreground/[0.06]' : 'bg-foreground/[0.03]'
            )}
            key={`tool-${offset}`}
          />
        ))}
      </span>

      {/* You, at the bottom, doing the routing */}
      <span className="absolute bottom-1 flex h-7 w-7 items-center justify-center rounded-full border border-dynamic-yellow/45 bg-dynamic-yellow/10">
        <span className="h-2 w-2 rounded-full bg-dynamic-yellow/80" />
        <span className="absolute inset-0 animate-ring-pulse rounded-full border border-dynamic-yellow/40" />
      </span>
    </div>
  );
}
