/**
 * Versioned consent notice for live meeting transcription. Copy lives in the
 * `meet.consent` message namespace; bump this version whenever that copy changes
 * so every record in `private.meet_ai_consents` names the notice it accepted.
 */
export const MEET_CONSENT_NOTICE_VERSION = 'meet-transcription-v1-draft';

export const MEET_CONSENT_DECISIONS = ['allow', 'deny', 'withdraw'] as const;
export type MeetConsentDecision = (typeof MEET_CONSENT_DECISIONS)[number];

/** Retention shown in the notice until workspace Meet settings are read. */
export const MEET_CONSENT_DEFAULT_RETENTION_DAYS = 365;
