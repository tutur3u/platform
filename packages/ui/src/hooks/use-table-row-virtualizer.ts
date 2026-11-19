'use client';

import {
  measureElement,
  observeElementRect,
  useVirtualizer,
} from '@tanstack/react-virtual';
import type { RefObject } from 'react';

export interface TableRowWindow {
  /** Indexes of the rows to render, in order. */
  indexes: number[];
  /** Height of the spacer row above the rendered rows. */
  paddingTop: number;
  /** Height of the spacer row below the rendered rows. */
  paddingBottom: number;
  /** Ref callback for each rendered row, so real heights replace estimates. */
  measureRow: (element: Element | null) => void;
}

/**
 * Windows long HTML tables. Only rows near the viewport render; one spacer
 * row above and one below keep the scroll height and sticky headers intact.
 */
export function useTableRowVirtualizer({
  count,
  scrollRef,
  estimateRowHeight = 44,
  overscan = 10,
}: {
  count: number;
  scrollRef: RefObject<HTMLElement | null>;
  estimateRowHeight?: number;
  overscan?: number;
}): TableRowWindow {
  const fallbackHeight = estimateRowHeight * 20;
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan,
    // Until the scroll element has a real height (first paint, a hidden
    // panel, no layout engine), assume a viewport of about 20 rows so the
    // first screen renders at once instead of an empty table.
    initialRect: { width: 0, height: fallbackHeight },
    // A row without a measured height keeps its estimate rather than 0.
    measureElement: (element, entry, instance) => {
      const height = measureElement(element, entry, instance);
      return height > 0 ? height : estimateRowHeight;
    },
    observeElementRect: (instance, onRect) =>
      observeElementRect(instance, (rect) =>
        onRect(rect.height > 0 ? rect : { ...rect, height: fallbackHeight })
      ),
  });
  const items = virtualizer.getVirtualItems();
  const total = virtualizer.getTotalSize();
  const first = items[0];
  const last = items[items.length - 1];
  return {
    indexes: items.map((item) => item.index),
    paddingTop: first ? first.start : 0,
    paddingBottom: last ? Math.max(0, total - last.end) : 0,
    measureRow: virtualizer.measureElement,
  };
}
