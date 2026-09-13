import type { MeetRoomCommand, MeetRoomSnapshot } from './room';
import { startRoomBudget } from './room-budget';
import { meetTrackKey } from './room-tracks';

/** A provider success rejected by the current room still requires durable cleanup. */
export function queueUncommittedPublication(
  state: MeetRoomSnapshot,
  command: MeetRoomCommand
): MeetRoomSnapshot {
  if (command.message.type !== 'sfu.tracks.publish') return state;
  state = startRoomBudget(state, command.token, Date.parse(command.now));
  if (!state.budget) throw new Error('publication_cleanup_budget_missing');
  const message = command.message;
  const publications = message.tracks.map((track) => ({
    ...track,
    sessionId: message.sessionId,
    userId: command.token.userId,
  }));
  return {
    ...state,
    budget: {
      ...state.budget,
      nextCleanupAt: 0,
      pendingPublications: [
        ...new Map(
          [...(state.budget.pendingPublications ?? []), ...publications].map(
            (track) => [meetTrackKey(track), track]
          )
        ).values(),
      ],
    },
  };
}

/** Preserve current usage counters and cleanup obligations added after a sweep started. */
export function mergePublicationCleanup(
  current: MeetRoomSnapshot,
  started: MeetRoomSnapshot,
  progress: MeetRoomSnapshot
): MeetRoomSnapshot {
  if (!current.budget) return current;
  const remaining = new Set(
    (progress.budget?.pendingPublications ?? []).map(meetTrackKey)
  );
  const completed = new Set(
    (started.budget?.pendingPublications ?? [])
      .map(meetTrackKey)
      .filter((key) => !remaining.has(key))
  );
  return {
    ...current,
    budget: {
      ...current.budget,
      pendingPublications: current.budget.pendingPublications?.filter(
        (track) => !completed.has(meetTrackKey(track))
      ),
    },
  };
}
