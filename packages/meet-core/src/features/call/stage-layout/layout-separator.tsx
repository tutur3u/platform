'use client';

import { cn } from '@tuturuuu/utils/format';
import { useRef } from 'react';
import { type Boundary, boundaryStyle } from './layout-geometry';

/** Percent of a split moved by an arrow key; Shift moves it further. */
const STEP = 5;
const BIG_STEP = 15;

export const STAGE_GUTTER = 12;

/**
 * The draggable line between two panes. It is a focusable separator, so
 * arrow keys resize it, Home and End move it to either limit, and Enter or a
 * double click shares the two panes equally.
 */
export function LayoutSeparator({
  boundary,
  label,
  extent,
  onPreview,
  onCommit,
  onReset,
}: {
  boundary: Boundary;
  label: string;
  /** The split's length in pixels along the boundary's axis, read on demand. */
  extent: () => number;
  /** Shows a position while dragging, without saving it. */
  onPreview: (position: number) => void;
  /** Saves a position: the end of a drag, or one keyboard step. */
  onCommit: (position: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{
    pointer: number;
    start: number;
    origin: number;
    percentPerPixel: number;
    latest: number;
    scheduled: boolean;
    frame: number;
  } | null>(null);
  const vertical = boundary.axis === 'row';
  const finish = (pointer: number) => {
    const active = drag.current;
    if (!active || active.pointer !== pointer) return;
    drag.current = null;
    cancelAnimationFrame(active.frame);
    onCommit(active.latest);
  };
  const decrease = vertical ? 'ArrowLeft' : 'ArrowUp';
  const increase = vertical ? 'ArrowRight' : 'ArrowDown';
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(boundary.now)}
      aria-valuemin={Math.round(boundary.min)}
      aria-valuemax={Math.round(boundary.max)}
      style={boundaryStyle(boundary, STAGE_GUTTER)}
      className={cn(
        'group absolute z-10 flex touch-none items-center justify-center outline-none',
        vertical ? 'cursor-col-resize' : 'cursor-row-resize'
      )}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current) return;
        const length = extent();
        if (!length) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = {
          pointer: event.pointerId,
          start: vertical ? event.clientX : event.clientY,
          origin: boundary.now,
          percentPerPixel: 100 / length,
          latest: boundary.now,
          scheduled: false,
          frame: 0,
        };
        event.currentTarget.focus();
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const active = drag.current;
        if (!active || active.pointer !== event.pointerId) return;
        const at = vertical ? event.clientX : event.clientY;
        active.latest =
          active.origin + (at - active.start) * active.percentPerPixel;
        // One preview per frame, however fast the pointer reports.
        if (!active.scheduled) {
          active.scheduled = true;
          active.frame = requestAnimationFrame(() => {
            active.scheduled = false;
            onPreview(active.latest);
          });
        }
      }}
      onPointerUp={(event) => finish(event.pointerId)}
      onPointerCancel={(event) => finish(event.pointerId)}
      onLostPointerCapture={(event) => finish(event.pointerId)}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const step = event.shiftKey ? BIG_STEP : STEP;
        switch (event.key) {
          case decrease:
            onCommit(boundary.now - step);
            break;
          case increase:
            onCommit(boundary.now + step);
            break;
          case 'Home':
            onCommit(boundary.min);
            break;
          case 'End':
            onCommit(boundary.max);
            break;
          case 'Enter':
            onReset();
            break;
          default:
            return;
        }
        event.preventDefault();
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'rounded-full bg-border transition-colors group-hover:bg-foreground/40 group-focus-visible:bg-ring group-focus-visible:ring-2 group-focus-visible:ring-ring/40',
          vertical ? 'h-11 w-1' : 'h-1 w-11'
        )}
      />
    </div>
  );
}
