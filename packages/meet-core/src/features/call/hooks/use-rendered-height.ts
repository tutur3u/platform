import { type RefObject, useEffect } from 'react';

/** Device-pixel ratio cap: denser screens gain nothing from a larger layer. */
const MAX_PIXEL_RATIO = 2;

/**
 * Report an element's rendered height in device pixels whenever it resizes.
 * Values are rounded to 40 px steps so small layout jitter does not churn.
 */
export function useRenderedHeight(
  ref: RefObject<HTMLElement | null>,
  report: ((devicePx: number | null) => void) | undefined
) {
  useEffect(() => {
    const element = ref.current;
    if (!element || !report || typeof ResizeObserver === 'undefined') return;
    let last: number | null = null;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
      const next = Math.round((entry.contentRect.height * ratio) / 40) * 40;
      if (next === last) return;
      last = next;
      report(next);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      report(null);
    };
  }, [ref, report]);
}
