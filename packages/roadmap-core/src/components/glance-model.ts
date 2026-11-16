/** The glance grid's ordering and ring colours (components/pulse.tsx). */

export type GlanceBand = 'done' | 'good' | 'attention';

/** A track's ring colour: complete, mostly shipped, or needs attention. */
export function glanceBand(share: number): GlanceBand {
  if (share >= 1) return 'done';
  if (share >= 0.8) return 'good';
  return 'attention';
}

/**
 * Tracks with the most left to ship first; equal shares keep the curated
 * track order (Array.prototype.sort is stable).
 */
export function glanceOrder<T extends { share: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.share - b.share);
}
