import { closeOpenAttendanceIntervals } from './attendance-ledger';
import { type MeetClassFeatures, meetClassFeatures } from './class-features';
import type { MeetRoomSnapshot } from './room';
import { failActiveRecording } from './room-recording';
import { publicationCleanupKey } from './room-tracks';

/** Ending never discards provider cleanup or creates another resource allowance. */
export function endMeetRoom(
  state: MeetRoomSnapshot,
  now: string,
  features: MeetClassFeatures = meetClassFeatures()
) {
  const attendance = features.attendance
    ? closeOpenAttendanceIntervals(state.attendance, now)
    : undefined;
  return {
    ...failActiveRecording(state, now),
    ...(attendance === undefined ? {} : { attendance }),
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
    transcription: state.transcription
      ? { ...state.transcription, active: false }
      : undefined,
    transcriptionConsents: undefined,
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
