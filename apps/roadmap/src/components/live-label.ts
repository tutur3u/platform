import type { LiveState } from '../live/use-live-data';

/** The hero's live-state labels, in their stacked order. */
export const SHOWN_STATES = ['snapshot', 'live', 'failed'] as const;

export type ShownState = (typeof SHOWN_STATES)[number];

/**
 * What the data on screen is. Source first: live data is labelled live in
 * every state (a refresh running over it, or a failed check while the page
 * still shows it during the switch back to the snapshot). Build data is the
 * snapshot, or "snapshot only" once a live check has failed.
 */
export function shownState(
  state: LiveState,
  source: 'build' | 'live'
): ShownState {
  if (source === 'live') return 'live';
  return state === 'failed' ? 'failed' : 'snapshot';
}
