import type { LiveState } from '../live/use-live-data';

/** The hero's live-state labels, in their stacked order. */
export const SHOWN_STATES = ['snapshot', 'live', 'failed'] as const;

export type ShownState = (typeof SHOWN_STATES)[number];

/**
 * What the data on screen is: live data (also while a refresh runs over
 * earlier live data), the build snapshot (also while a refresh runs over
 * it), or the snapshot after a failed live check.
 */
export function shownState(
  state: LiveState,
  source: 'build' | 'live'
): ShownState {
  if (state === 'failed') return 'failed';
  return source === 'live' ? 'live' : 'snapshot';
}
