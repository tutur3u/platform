import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

/**
 * Chrome shared by every miniature product visual in the bento.
 *
 * The previews are static CSS/SVG compositions — no data fetching, no chart
 * library, no motion runtime — so they stay server components and cost nothing
 * at runtime. They exist so the grid shows what a product looks like instead of
 * asking the reader to infer it from an icon.
 */
export function PreviewFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative w-full overflow-hidden rounded-xl border border-foreground/10 bg-background/50 p-3 shadow-foreground/5 shadow-sm',
        className
      )}
    >
      {/* Lit top edge: reads as a pane of glass catching light. */}
      <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent" />
      {children}
    </div>
  );
}

/**
 * The label/value strip above a preview body. The mono face and wide tracking
 * are what make it read as instrument chrome rather than content.
 */
export function PreviewHeader({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value?: string;
  valueClassName?: string;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <span className="font-mono-ui text-[0.6rem] text-foreground/35 uppercase tracking-[0.18em]">
        {label}
      </span>
      {value ? (
        <span
          className={cn(
            'font-mono-ui text-[0.62rem] tabular-nums',
            valueClassName ?? 'text-foreground/45'
          )}
        >
          {value}
        </span>
      ) : null}
    </div>
  );
}

/** A skeleton text run. Widths are authored, never random, so it composes. */
export function Line({
  width,
  className,
}: {
  width: number;
  className?: string;
}) {
  return (
    <span
      className={cn('block h-1 rounded-full bg-foreground/15', className)}
      style={{ width: `${width}%` }}
    />
  );
}
