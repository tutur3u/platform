import type { MeetRoomCommand, MeetRoomSnapshot } from './room';
import { startRoomBudget } from './room-budget';
import { publicationCleanupKey } from './room-tracks';

/** A provider success rejected by the current room still requires durable cleanup. */
export function queueUncommittedPublication(
  state: MeetRoomSnapshot,
  command: MeetRoomCommand,
  providerResult: unknown
): MeetRoomSnapshot {
  if (command.message.type !== 'sfu.tracks.publish') return state;
  const response = providerResult as {
    errorCode?: unknown;
    tracks?: Array<{ mid?: string; errorCode?: unknown }>;
  } | null;
  if (!response || response.errorCode || !Array.isArray(response.tracks))
    return state;
  const confirmedMids = new Set(
    response.tracks
      .filter((track) => track && !track.errorCode)
      .map((track) => track.mid)
  );
  const message = command.message;
  const publications = message.tracks
    .filter((track) => confirmedMids.has(track.mid))
    .map((track) => ({
      ...track,
      sessionId: message.sessionId,
      userId: command.token.userId,
    }));
  if (!publications.length) return state;
  state = startRoomBudget(state, command.token, Date.parse(command.now));
  if (!state.budget) throw new Error('publication_cleanup_budget_missing');
  return {
    ...state,
    budget: {
      ...state.budget,
      nextCleanupAt: 0,
      pendingPublications: [
        ...new Map(
          [...(state.budget.pendingPublications ?? []), ...publications].map(
            (track) => [publicationCleanupKey(track), track]
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
    (progress.budget?.pendingPublications ?? []).map(publicationCleanupKey)
  );
  const completed = new Set(
    (started.budget?.pendingPublications ?? [])
      .map(publicationCleanupKey)
      .filter((key) => !remaining.has(key))
  );
  return {
    ...current,
    budget: {
      ...current.budget,
      pendingPublications: current.budget.pendingPublications?.filter(
        (track) => !completed.has(publicationCleanupKey(track))
      ),
    },
  };
}
