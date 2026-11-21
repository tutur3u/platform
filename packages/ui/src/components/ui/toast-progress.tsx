'use client';

import { Progress } from './progress';

export interface ToastProgressProps {
  /** What is running, e.g. "Deleting tasks". Also names the progress bar. */
  label: string;
  /** Items finished so far. */
  done: number;
  /** Items in the whole operation. */
  total: number;
}

/**
 * Body for a running bulk-operation toast: label, x/N and a bar. Pass it as
 * the message of `toast.loading(…, { id })` and update the same id as work
 * finishes; the finished toast (`toast.success(…, { id, action })`) keeps the
 * layout and puts the Undo action beside the message. Colours and the bar
 * shape come from floating-surface.css, so it follows light, dark and Sorbet.
 */
export function ToastProgress({ label, done, total }: ToastProgressProps) {
  const safeTotal = Math.max(0, total);
  const safeDone = Math.min(Math.max(0, done), safeTotal);
  const percent = safeTotal > 0 ? Math.round((safeDone / safeTotal) * 100) : 0;

  return (
    <div
      data-slot="toast-progress"
      className="flex w-full min-w-56 flex-col gap-2"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate">{label}</span>
        <span
          data-slot="toast-progress-count"
          className="shrink-0 font-normal text-muted-foreground text-xs tabular-nums"
        >
          {safeDone}/{safeTotal}
        </span>
      </div>
      <Progress
        aria-label={label}
        aria-valuemax={safeTotal}
        aria-valuenow={safeDone}
        className="h-1"
        value={percent}
      />
    </div>
  );
}
