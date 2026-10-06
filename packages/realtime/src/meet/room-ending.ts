import type { MeetRoomSnapshot } from './room';
import { failActiveRecording } from './room-recording';
import { publicationCleanupKey } from './room-tracks';

/** Ending never discards provider cleanup or creates another resource allowance. */
export function endMeetRoom(state: MeetRoomSnapshot, now: string) {
  return {
    ...failActiveRecording(state, now),
    budget: state.budget
      ? {
          ...state.budget,
          nextCleanupAt: 0,
          pendingPublications: [
            ...new Map(
              [
                ...(state.budget.pendingPublications ?? []),
                ...Object.values(state.tracks),
              ].map((track) => [publicationCleanupKey(track), track])
            ).values(),
          ],
        }
      : undefined,
    ended: true,
    lifecycle: {
      ...state.lifecycle,
      version: (state.lifecycle?.version ?? 0) + 1,
      hadConnection: state.lifecycle?.hadConnection ?? !!state.budget,
      emptySince: undefined,
    },
    presence: {},
    waiting: {},
    tracks: {},
    lastReactionAt: {},
  } satisfies MeetRoomSnapshot;
}
