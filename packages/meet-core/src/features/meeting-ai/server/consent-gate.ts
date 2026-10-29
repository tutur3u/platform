import type { MeetConsentRecord } from './consent-records';

// Client clocks and batching can place a clip slightly before its consent row.
const CAPTURE_SKEW_MS = 10_000;

/**
 * Server-side consent policy for one upload. The uploading host's own sources
 * need no record. Every other source needs an `allow` that is both the latest
 * decision for that account and in force when the clip was captured.
 * Unattributed sources cannot be matched to a decision and are excluded.
 */
export function consentedSourceIndexes(input: {
  actorId: string;
  sessionStartedAt: string;
  sources: Array<{ speakerAccountId?: string; startSeconds: number }>;
  records: MeetConsentRecord[] | null;
}) {
  const started = Date.parse(input.sessionStartedAt);
  const kept: number[] = [];
  for (const [index, source] of input.sources.entries()) {
    const account = source.speakerAccountId;
    if (!account) continue;
    if (account === input.actorId) {
      kept.push(index);
      continue;
    }
    const decisions = (input.records ?? []).filter(
      (record) => record.user_id === account
    );
    if (decisions.at(-1)?.decision !== 'allow') continue;
    const capturedAt = started + source.startSeconds * 1000;
    const inForce = decisions
      .filter(
        (record) =>
          Date.parse(record.created_at) <= capturedAt + CAPTURE_SKEW_MS
      )
      .at(-1);
    if (inForce?.decision === 'allow') kept.push(index);
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
