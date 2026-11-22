'use client';

import { useEffect, useState } from 'react';
import { isTooSmall, type SizeClass, sizeClassOf } from './layout-geometry';

export interface PaneSize {
  sizeClass: SizeClass;
  tooSmall: boolean;
}

const UNMEASURED: PaneSize = { sizeClass: 'medium', tooSmall: false };

/**
 * A pane's container-query tier and whether it is below the least usable
 * size, measured on the element itself so it follows resizing, not the
 * viewport. Until measured (or without ResizeObserver) the pane counts as
 * usable.
 */
export function usePaneSize(element: HTMLElement | null): PaneSize {
  const [size, setSize] = useState<PaneSize>(UNMEASURED);
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (!box) return;
      const next: PaneSize = {
        sizeClass: sizeClassOf(box.width),
        tooSmall: box.width > 0 && isTooSmall(box),
      };
      setSize((current) =>
        current.sizeClass === next.sizeClass &&
        current.tooSmall === next.tooSmall
          ? current
          : next
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}
