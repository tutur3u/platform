/**
 * Net Promoter Score constants and banding.
 *
 * Deliberately free of `'use client'` and of any React import: both the
 * runtime field and the server-side analytics need this, and importing the
 * client component from the analytics path would drag the whole field into a
 * server bundle.
 */

/** NPS is defined as 0-10, so unlike `linear_scale` the bounds are fixed. */
export const NPS_MIN = 0;
export const NPS_MAX = 10;

export const NPS_SCORES = Array.from(
  { length: NPS_MAX - NPS_MIN + 1 },
  (_, index) => NPS_MIN + index
);

export type NpsBand = 'detractor' | 'passive' | 'promoter';

/** The standard banding. Analytics and the runtime must agree on it. */
export function getNpsBand(score: number): NpsBand {
  if (score <= 6) return 'detractor';
  if (score <= 8) return 'passive';
  return 'promoter';
}

export function isValidNpsScore(score: number): boolean {
  return Number.isInteger(score) && score >= NPS_MIN && score <= NPS_MAX;
}

/**
 * The score itself: percentage of promoters minus percentage of detractors,
 * rounded to a whole number as the metric is conventionally reported. Passives
 * count toward the total but not toward either side — that is the point of the
 * band.
 */
export function calculateNpsScore(counts: {
  promoters: number;
  passives: number;
  detractors: number;
}): number {
  const total = counts.promoters + counts.passives + counts.detractors;
  if (total === 0) return 0;

  return Math.round(((counts.promoters - counts.detractors) / total) * 100);
}
