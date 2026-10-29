/**
 * Versioned consent notice for live meeting transcription. Copy lives in the
 * `meet.consent` message namespace; bump this version whenever that copy changes
 * so every record in `private.meet_ai_consents` names the notice it accepted.
 */
export const MEET_CONSENT_NOTICE_VERSION = 'meet-transcription-v3-2026-10-30';

export const MEET_CONSENT_DECISIONS = ['allow', 'deny', 'withdraw'] as const;
export type MeetConsentDecision = (typeof MEET_CONSENT_DECISIONS)[number];

// TODO(meet-transcript-retention-purge): no purge job or workspace retention
// setting applies to Meet transcripts yet, so the notice only says they are
// kept until deleted. Once the Cloudflare-scheduled purge of expired
// transcripts ships (tracked separately), state the retention period here and
// bump MEET_CONSENT_NOTICE_VERSION.
