import type { MeetRoomSnapshot } from './room';
import { publicationCleanupKey } from './room-tracks';
import type { CloseTracksInput } from './sfu';

type ProviderTrack = {
  mid?: string;
  trackName?: string;
  location?: string;
  errorCode?: unknown;
};
function providerResponse(value: unknown): {
  errorCode?: unknown;
  tracks?: ProviderTrack[];
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Meeting publication cleanup failed');
  const response = value as { errorCode?: unknown; tracks?: unknown };
  if (
    response.tracks !== undefined &&
    (!Array.isArray(response.tracks) ||
      response.tracks.some((track) => !track || typeof track !== 'object'))
  )
    throw new Error('Meeting publication cleanup failed');
  return response as { errorCode?: unknown; tracks?: ProviderTrack[] };
}

/** Persist confirmed closures per provider track; one failed session cannot starve another. */
export async function closeBudgetPublications(
  state: MeetRoomSnapshot,
  close: (input: CloseTracksInput) => Promise<unknown>,
  persistProgress?: (state: MeetRoomSnapshot) => Promise<void>,
  getSession?: (sessionId: string) => Promise<unknown>
): Promise<MeetRoomSnapshot> {
  const pending = state.budget?.pendingPublications;
  if (!pending?.length) return state;
  let progress = state;
  let failure: unknown;
  for (const sessionId of new Set(pending.map((track) => track.sessionId))) {
    const tracks = pending.filter((track) => track.sessionId === sessionId);
    const resolved = new Map<string, string>();
    const completed = new Set<string>();
    for (const track of tracks)
      if (track.mid) resolved.set(publicationCleanupKey(track), track.mid);
    const legacy = tracks.filter((track) => !track.mid);
    if (legacy.length) {
      try {
        if (!getSession)
          throw new Error(
            'Meeting publication cleanup requires a provider track identifier'
          );
        const session = providerResponse(await getSession(sessionId));
        if (
          session.errorCode ||
          !session.tracks ||
          session.tracks.some(
            (track) =>
              !['local', 'remote'].includes(track.location ?? '') ||
              typeof track.trackName !== 'string' ||
              !track.trackName ||
              typeof track.mid !== 'string' ||
              !track.mid
          )
        )
          throw new Error('Meeting publication cleanup lookup failed');
        for (const track of legacy) {
          if (!track.trackName)
            throw new Error(
              'Meeting publication cleanup requires a provider track identifier'
            );
          const matches = session.tracks.filter(
            (candidate) =>
              candidate.location === 'local' &&
              candidate.trackName === track.trackName
          );
          if (!matches.length) completed.add(publicationCleanupKey(track));
          else if (
            matches.length === 1 &&
            typeof matches[0]?.mid === 'string' &&
            matches[0].mid &&
            !matches[0].errorCode
          )
            resolved.set(publicationCleanupKey(track), matches[0].mid);
          else
            throw new Error('Meeting publication cleanup lookup is ambiguous');
        }
      } catch (error) {
        failure = error;
      }
    }
    if (resolved.size) {
      try {
        const result = providerResponse(
          await close({
            sessionId,
            force: true,
            tracks: [...new Set(resolved.values())].map((mid) => ({ mid })),
          })
        );
        const successful = result.tracks
          ? new Set(
              result.tracks
                .filter((track) => !track.errorCode)
                .map((track) => track.mid)
            )
          : result.errorCode
            ? new Set<string>()
            : new Set(resolved.values());
        for (const [key, mid] of resolved)
          if (successful.has(mid)) completed.add(key);
        if (
          result.errorCode ||
          [...resolved.keys()].some((key) => !completed.has(key))
        )
          failure = new Error('Meeting publication cleanup failed');
      } catch (error) {
        failure = error;
      }
    }
    if (completed.size) {
      progress = {
        ...progress,
        budget: {
          ...progress.budget!,
          pendingPublications: progress.budget!.pendingPublications!.filter(
            (track) => !completed.has(publicationCleanupKey(track))
          ),
        },
      };
      // A failed persistence must abort; never report unpersisted provider progress as durable.
      await persistProgress?.(progress);
    }
  }
  if (failure) throw failure;
  return progress;
}
