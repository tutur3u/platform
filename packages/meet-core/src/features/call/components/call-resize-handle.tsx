'use client';

import { GripHorizontal, GripVertical } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useRef } from 'react';

export function CallResizeHandle({
  label,
  controls,
  axis,
  size,
  min,
  max,
  initial,
  onResize,
  onCommit,
  percent = false,
  reverse = false,
  className,
}: {
  label: string;
  controls: string;
  axis: 'x' | 'y';
  size: number;
  min: number;
  max: number;
  initial: number;
  onResize: (size: number) => void;
  onCommit?: (size: number) => void;
  percent?: boolean;
  reverse?: boolean;
  className?: string;
}) {
  const drag = useRef<{
    pointer: number;
    start: number;
    size: number;
    unit: number;
    next: number;
  } | null>(null);
  const horizontal = axis === 'x';
  const Grip = horizontal ? GripVertical : GripHorizontal;
  const direction = reverse ? -1 : 1;
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const commit = (next: number) => {
    const bounded = clamp(next);
    onResize(bounded);
    onCommit?.(bounded);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(size)}
      className={cn(
        'z-10 flex touch-none items-center justify-center rounded-sm outline-none before:pointer-events-none before:absolute before:bg-border hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring',
        horizontal
          ? 'cursor-col-resize before:h-full before:w-px'
          : 'cursor-row-resize before:h-px before:w-full',
        className
      )}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current) return;
        const parent = event.currentTarget.parentElement;
        if (!parent) return;
        const bounds = parent.getBoundingClientRect();
        const length = horizontal ? bounds.width : bounds.height;
        const unit = percent ? 100 / Math.max(1, length) : 1;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointer: event.pointerId,
          start: horizontal ? event.clientX : event.clientY,
          size,
          unit,
          next: size,
        };
        event.currentTarget.focus();
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const active = drag.current;
        if (!active || active.pointer !== event.pointerId) return;
        const position = horizontal ? event.clientX : event.clientY;
        active.next = clamp(
          active.size + (position - active.start) * direction * active.unit
        );
        onResize(active.next);
      }}
      onLostPointerCapture={(event) => {
        const active = drag.current;
        if (!active || active.pointer !== event.pointerId) return;
        drag.current = null;
        onCommit?.(active.next);
      }}
      onDoubleClick={() => commit(initial)}
      onKeyDown={(event) => {
        const step = (percent ? 5 : 24) * direction;
        const decrease = horizontal ? 'ArrowLeft' : 'ArrowUp';
        const increase = horizontal ? 'ArrowRight' : 'ArrowDown';
        switch (event.key) {
          case decrease:
            commit(size - step);
            break;
          case increase:
            commit(size + step);
            break;
          case 'Home':
            commit(min);
            break;
          case 'End':
            commit(max);
            break;
          case 'Enter':
            commit(initial);
            break;
          default:
            return;
        }
        event.preventDefault();
      }}
    >
      <Grip
        aria-hidden="true"
        className={cn(
          'shrink-0 rounded border bg-background text-muted-foreground',
          horizontal ? 'h-7 w-3' : 'h-3 w-7'
        )}
      />
    </div>
  );
}
