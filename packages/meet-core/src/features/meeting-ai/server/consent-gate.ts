import type { MeetConsentRecord } from './consent-records';

/**
 * A non-allow decision also excludes clips that end within this margin before
 * it. The margin only ever widens exclusion; an allow is never backdated.
 */
const WITHDRAW_MARGIN_MS = 10_000;
/** Rounding slack between back-to-back clips of the same host track. */
const TRACK_OVERLAP_SLACK_SECONDS = 0.25;

export type ConsentGateSource = {
  speakerAccountId?: string;
  sourceKind?: 'microphone' | 'shared_audio';
  startSeconds: number;
  durationSeconds: number;
};

/**
 * Decision in force at `time` for one account. Ties on `created_at` resolve to
 * "not allowed" unless every tied row is an allow.
 */
function allowedAt(records: MeetConsentRecord[], time: number) {
  let latest = Number.NEGATIVE_INFINITY;
  let allowed = false;
  for (const record of records) {
    const at = Date.parse(record.created_at);
    if (at > time) continue;
    if (at > latest) {
      latest = at;
      allowed = record.decision === 'allow';
    } else if (at === latest && record.decision !== 'allow') allowed = false;
  }
  return allowed;
}

/**
 * Server-side consent policy for one upload, applied to every clip.
 * - The uploading host's microphone needs no record.
 * - The host's shared (screen or tab) audio may carry other people's voices,
 *   so it is excluded when `excludeHostSharedAudio` is set.
 * - Any other speaker needs an allow that is the latest decision, was already
 *   in force when the clip started (no tolerance toward inclusion), and was not
 *   followed by a deny or withdraw before the clip ended plus a margin.
 * - Unattributed sources cannot be matched to a decision and are excluded.
 * Speaker labels and offsets come from the host client; see the trust model in
 * the Meet docs.
 */
export function consentedSourceIndexes(input: {
  actorId: string;
  sessionStartedAt: string;
  sources: ConsentGateSource[];
  records: MeetConsentRecord[] | null;
  excludeHostSharedAudio?: boolean;
}) {
  const started = Date.parse(input.sessionStartedAt);
  const kept: number[] = [];
  for (const [index, source] of input.sources.entries()) {
    const account = source.speakerAccountId;
    if (!account) continue;
    if (account === input.actorId) {
      if (
        !(input.excludeHostSharedAudio && source.sourceKind === 'shared_audio')
      )
        kept.push(index);
      continue;
    }
    const decisions = (input.records ?? []).filter(
      (record) => record.user_id === account
    );
    const start = started + source.startSeconds * 1000;
    const end = start + source.durationSeconds * 1000;
    if (!allowedAt(decisions, Number.POSITIVE_INFINITY)) continue;
    if (!allowedAt(decisions, start)) continue;
    const revoked = decisions.some((record) => {
      const at = Date.parse(record.created_at);
      return (
        record.decision !== 'allow' &&
        at > start &&
        at <= end + WITHDRAW_MARGIN_MS
      );
    });
    if (!revoked) kept.push(index);
  }
  return kept;
}

/** Solo host uploads carry only the actor's own sources and need no lookup. */
export function needsConsentRecords(
  actorId: string,
  sources: Array<{ speakerAccountId?: string }>
) {
  return sources.some((source) => source.speakerAccountId !== actorId);
}

/**
 * A host has at most one microphone and one shared-audio track. Host-labelled
 * clips of the same kind that overlap in time imply an extra track, which an
 * honest client never sends; back-to-back clips of one track are fine.
 */
export function hasExtraHostTracks(
  actorId: string,
  sources: ConsentGateSource[]
) {
  for (const kind of ['microphone', 'shared_audio'] as const) {
    const clips = sources
      .filter(
        (source) =>
          source.speakerAccountId === actorId &&
          (source.sourceKind ?? 'microphone') === kind
      )
      .sort((a, b) => a.startSeconds - b.startSeconds);
    for (let index = 1; index < clips.length; index++) {
      const previous = clips[index - 1]!;
      if (
        clips[index]!.startSeconds <
        previous.startSeconds +
          previous.durationSeconds -
          TRACK_OVERLAP_SLACK_SECONDS
      )
        return true;
    }
  }
  return false;
}

/** Whether the upload contains the host's shared audio, which needs the audience size. */
export function hasHostSharedAudio(
  actorId: string,
  sources: ConsentGateSource[]
) {
  return sources.some(
    (source) =>
      source.speakerAccountId === actorId &&
      source.sourceKind === 'shared_audio'
  );
}

/**
 * Host shared audio is transcribed only while the host is alone (admitted
 * people include the host). With anyone else present, or an unknown audience,
 * it is excluded.
 */
export const MEET_HOST_SHARED_AUDIO_MAX_ADMITTED = 1;
