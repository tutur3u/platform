'use client';

import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useRef } from 'react';

/**
 * One level of sidebar navigation. Entering or leaving a submenu slides the
 * new level in. Only navigation that happens while mounted slides: overlay
 * sidebars remount their content when the rail swaps for the panel, and that
 * reveal must fade in place rather than replay the slide.
 */
export function SidebarNavSlide({
  depth,
  direction,
  className,
  children,
}: {
  /** The submenu depth; a new depth mounts a new level. */
  depth: number;
  direction: 'forward' | 'backward';
  className?: string;
  children: ReactNode;
}) {
  const initialDepth = useRef(depth);
  const slide = depth !== initialDepth.current;
  return (
    <div
      key={depth}
      data-slot="sidebar-nav-level"
      className={cn(
        className,
        slide &&
          (direction === 'forward'
            ? 'slide-in-from-right animate-in'
            : 'slide-in-from-left animate-in')
      )}
    >
      {children}
    </div>
  );
}
