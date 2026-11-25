import { closeOpenAttendanceIntervals } from './attendance-ledger';
import { type MeetClassFeatures, meetClassFeatures } from './class-features';
import type { MeetRoomSnapshot } from './room';
import { ENDED_ROOM_TOOLS } from './room-outcome';
import { failActiveRecording } from './room-recording';
import { endSelfCaptureSession } from './room-self-capture-state';
import { publicationCleanupKey } from './room-tracks';

/** Ending never discards provider cleanup or creates another resource allowance. */
export function endMeetRoom(
  state: MeetRoomSnapshot,
  now: string,
  _features: MeetClassFeatures = meetClassFeatures()
) {
  // Room Mira state names the acceptor and keys every choice by account id.
  // A room that has ended cannot run Mira, so it keeps none of it; the durable
  // evidence in the database is what remains. Tutor chat shared with a
  // person's own Private Mira never outlives the meeting either.
  const {
    miraRoom: _miraRoom,
    miraShares: _miraShares,
    miraSharePending: _miraSharePending,
    ...kept
  } = state as MeetRoomSnapshot & {
    miraRoom?: unknown;
    miraShares?: unknown;
    miraSharePending?: unknown;
  };
  const attendance = closeOpenAttendanceIntervals(state.attendance, now);
  return {
    ...failActiveRecording(kept, now),
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
    selfCapture: endSelfCaptureSession(state.selfCapture, Date.parse(now)),
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
