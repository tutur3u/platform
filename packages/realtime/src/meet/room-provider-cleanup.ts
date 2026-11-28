import type { MeetRoomSnapshot } from './room';
import { publicationCleanupKey } from './room-tracks';
import type { CloseTracksInput } from './sfu';

type ProviderTrack = {
  mid?: string;
  trackName?: string;
  location?: string;
  errorCode?: unknown;
  errorDescription?: unknown;
};

const SESSION_GONE_CODES = new Set([
  'not_found_session_error',
  'session_not_found',
  'session_closed',
  'session_expired',
]);

const TRACK_GONE_CODES = new Set([
  'not_found_track_error',
  'track_not_found',
  'track_already_closed',
]);

const TRACK_GONE_DESCRIPTION =
  /doesn't exist|does not exist|already closed|not found/i;

const APP_NOT_FOUND_DESCRIPTION =
  /\bapp(?:lication)?\s+not\s+found\b|\binvalid\s+app\b/i;

function isProviderSessionGoneCode(code: unknown): boolean {
  return typeof code === 'string' && SESSION_GONE_CODES.has(code);
}

function isProviderTrackGone(track: ProviderTrack): boolean {
  if (typeof track.errorCode !== 'string') return false;
  if (TRACK_GONE_CODES.has(track.errorCode)) return true;
  return (
    track.errorCode === 'close_track_error' &&
    typeof track.errorDescription === 'string' &&
    TRACK_GONE_DESCRIPTION.test(track.errorDescription)
  );
}

function readProviderErrorInfo(error: unknown): {
  status?: number;
  errorCode?: string;
  errorDescription?: string;
} {
  if (!error || typeof error !== 'object') return {};
  const record = error as {
    status?: unknown;
    errorCode?: unknown;
    errorDescription?: unknown;
    message?: unknown;
  };
  let status =
    typeof record.status === 'number' && Number.isInteger(record.status)
      ? record.status
      : undefined;
  let errorCode =
    typeof record.errorCode === 'string' ? record.errorCode : undefined;
  let errorDescription =
    typeof record.errorDescription === 'string'
      ? record.errorDescription
      : undefined;
  if (typeof record.message === 'string') {
    const match = /^cloudflare_sfu_request_failed:(\d+)(?:\s+(.*))?$/s.exec(
      record.message
    );
    if (match) {
      status ??= Number(match[1]);
      if (match[2] && (!errorCode || !errorDescription)) {
        try {
          const parsed = JSON.parse(match[2]) as {
            errorCode?: unknown;
            errorDescription?: unknown;
          };
          if (!errorCode && typeof parsed?.errorCode === 'string')
            errorCode = parsed.errorCode;
          if (!errorDescription && typeof parsed?.errorDescription === 'string')
            errorDescription = parsed.errorDescription;
        } catch {
          // Message tail may be truncated or plain text.
        }
      }
    }
  }
  return { status, errorCode, errorDescription };
}

function isProviderSessionGoneError(error: unknown): boolean {
  const { status, errorCode, errorDescription } = readProviderErrorInfo(error);
  if (isProviderSessionGoneCode(errorCode)) return true;
  if (status !== 404 && status !== 410) return false;
  if (errorCode === 'app_not_found') return false;
  if (errorDescription && APP_NOT_FOUND_DESCRIPTION.test(errorDescription))
    return false;
  return true;
}

/** Secret-free diagnostic summary for media cleanup logs. */
export function describeProviderCleanupError(error: unknown): {
  reason: string;
  status?: number;
  errorCode?: string;
} {
  const { status, errorCode } = readProviderErrorInfo(error);
  if (status !== undefined) {
    return {
      reason: 'sfu_http_error',
      status,
      ...(errorCode ? { errorCode } : {}),
    };
  }
  if (errorCode) return { reason: 'sfu_provider_error', errorCode };
  if (error instanceof Error) {
    if (error.message.includes('lookup'))
      return { reason: 'provider_lookup_failed' };
    if (error.message.includes('identifier'))
      return { reason: 'missing_track_identifier' };
    if (error.message.includes('cleanup failed'))
      return { reason: 'provider_close_unconfirmed' };
  }
  return { reason: 'provider_request_error' };
}

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

function sessionInventory(value: unknown): ProviderTrack[] | 'session_gone' {
  const session = providerResponse(value);
  if (isProviderSessionGoneCode(session.errorCode)) return 'session_gone';
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
  return session.tracks!;
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
    const completeSession = () => {
      for (const track of tracks) completed.add(publicationCleanupKey(track));
    };
    let sessionFailure: unknown;
    for (const track of tracks)
      if (track.mid) resolved.set(publicationCleanupKey(track), track.mid);
    const legacy = tracks.filter((track) => !track.mid);
    if (legacy.length) {
      try {
        if (!getSession)
          throw new Error(
            'Meeting publication cleanup requires a provider track identifier'
          );
        const inventory = sessionInventory(await getSession(sessionId));
        if (inventory === 'session_gone') {
          completeSession();
        } else {
          for (const track of legacy) {
            if (!track.trackName)
              throw new Error(
                'Meeting publication cleanup requires a provider track identifier'
              );
            const matches = inventory.filter(
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
              throw new Error(
                'Meeting publication cleanup lookup is ambiguous'
              );
          }
        }
      } catch (error) {
        if (isProviderSessionGoneError(error)) completeSession();
        else sessionFailure = error;
      }
    }
    const remainingResolved = [...resolved.entries()].filter(
      ([key]) => !completed.has(key)
    );
    if (remainingResolved.length) {
      try {
        const mids = [...new Set(remainingResolved.map(([, mid]) => mid))];
        const result = providerResponse(
          await close({
            sessionId,
            force: true,
            tracks: mids.map((mid) => ({ mid })),
          })
        );
        if (isProviderSessionGoneCode(result.errorCode)) {
          completeSession();
        } else {
          const successful = result.tracks
            ? new Set(
                result.tracks
                  .filter(
                    (track) => !track.errorCode || isProviderTrackGone(track)
                  )
                  .map((track) => track.mid)
              )
            : result.errorCode
              ? new Set<string>()
              : new Set(mids);
          for (const [key, mid] of remainingResolved)
            if (successful.has(mid)) completed.add(key);
          if (
            result.errorCode ||
            remainingResolved.some(([key]) => !completed.has(key))
          )
            sessionFailure = new Error('Meeting publication cleanup failed');
        }
      } catch (error) {
        if (isProviderSessionGoneError(error)) completeSession();
        else sessionFailure = error;
      }
    }
    // A previous attempt may have closed the track before its durable write failed.
    // Confirm absence from the provider instead of assuming close errors are idempotent.
    if (getSession && remainingResolved.some(([key]) => !completed.has(key))) {
      try {
        const inventory = sessionInventory(await getSession(sessionId));
        if (inventory === 'session_gone') {
          completeSession();
        } else {
          const present = new Set(inventory.map((track) => track.mid));
          for (const [key, mid] of remainingResolved)
            if (!present.has(mid)) completed.add(key);
        }
      } catch (error) {
        if (isProviderSessionGoneError(error)) completeSession();
        else sessionFailure = error;
      }
    }
    if (
      tracks.some((track) => !completed.has(publicationCleanupKey(track))) &&
      sessionFailure !== undefined
    ) {
      failure = sessionFailure;
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
  if (progress.budget?.pendingPublications?.length)
    throw failure ?? new Error('Meeting publication cleanup failed');
  return progress;
}
