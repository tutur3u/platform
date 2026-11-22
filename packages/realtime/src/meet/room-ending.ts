import { closeOpenAttendanceIntervals } from './attendance-ledger';
import { type MeetClassFeatures, meetClassFeatures } from './class-features';
import type { MeetRoomSnapshot } from './room';
import { ENDED_ROOM_TOOLS } from './room-outcome';
import { failActiveRecording } from './room-recording';
import { publicationCleanupKey } from './room-tracks';

/** Ending never discards provider cleanup or creates another resource allowance. */
export function endMeetRoom(
  state: MeetRoomSnapshot,
  now: string,
  _features: MeetClassFeatures = meetClassFeatures()
) {
  const attendance = closeOpenAttendanceIntervals(state.attendance, now);
  return {
    ...failActiveRecording(state, now),
    ...(attendance === undefined ? {} : { attendance }),
    endedAt: state.endedAt ?? now,
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
    ...ENDED_ROOM_TOOLS,
    ...(state.publishedFormLaunches && {
      publishedFormLaunches: state.publishedFormLaunches.map((launch) => ({
        ...launch,
        closed: true as const,
      })),
    }),
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
