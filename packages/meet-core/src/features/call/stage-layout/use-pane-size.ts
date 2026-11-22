'use client';

import { useEffect, useState } from 'react';
import {
  isTooSmall,
  SHORT_PANE_HEIGHT,
  type SizeClass,
  sizeClassOf,
} from './layout-geometry';

export interface PaneSize {
  sizeClass: SizeClass;
  tooSmall: boolean;
  short: boolean;
}

/** What a pane's frame takes from the body measured inside it. */
const PANE_CHROME = { width: 2, height: 45 };

const UNMEASURED: PaneSize = {
  sizeClass: 'medium',
  tooSmall: false,
  short: false,
};

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
        // The least usable size is the pane's: its border and header count.
        tooSmall:
          box.width > 0 &&
          isTooSmall({
            width: box.width + PANE_CHROME.width,
            height: box.height + PANE_CHROME.height,
          }),
        short:
          box.height > 0 && box.height + PANE_CHROME.height < SHORT_PANE_HEIGHT,
      };
      setSize((current) =>
        current.sizeClass === next.sizeClass &&
        current.tooSmall === next.tooSmall &&
        current.short === next.short
          ? current
          : next
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}
