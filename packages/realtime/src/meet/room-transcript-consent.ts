import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { RoomServiceState } from './room-service';

/**
 * All-participant fence for the meeting's live transcript. The host's browser
 * mixes every participant's audio, so a transcript chunk may reach the
 * provider only while every admitted account, guests included, has chosen
 * Allow on the current notice. A missing, older-version or Decline choice from
 * anyone present pauses the transcript for everyone.
 */
export const MEET_TRANSCRIPT_NOTICE_VERSION = '2026-11-23-transcript-v1';
export const MEET_TRANSCRIPT_CONSENT_REQUIRED =
  'The live transcript runs after everyone in the meeting allows it.';

export type MeetTranscriptChoice = {
  choice: 'allow' | 'decline';
  version: string;
  meetingId: string;
  accountId: string;
  recordedAt: number;
  revision: number;
};
export type MeetTranscriptState = {
  choices: Record<string, MeetTranscriptChoice>;
  /** The host's running transcript session, shown to everyone as an indicator. */
  active?: { accountId: string; sessionId: string; since: number };
};
export type MeetTranscriptFence = {
  ready: boolean;
  /** Admitted accounts without a current Allow, never their identities. */
  pending: number;
  /** Admitted accounts whose current choice is Decline. */
  declined: number;
  admitted: number;
};
export type MeetTranscriptConsentView = {
  version: string;
  choice: 'allow' | 'decline' | null;
  fence: MeetTranscriptFence;
  active: boolean;
  activeSince: number | null;
  /** Present when the read named chunk sources: every one has a current Allow. */
  sourcesAllowed?: boolean;
  /** Present when the read named a session: it is the running recording. */
  sessionActive?: boolean;
};

const command = z.discriminatedUnion('action', [
  // `accounts` lists the attributed sources of one audio chunk; each must
  // hold a current Allow, even after leaving.
  z.object({
    action: z.literal('transcript.consent.read'),
    accounts: z.array(z.uuid()).max(32).optional(),
    // The chunk's session; it must be the room's running recording.
    sessionId: z.uuid().optional(),
  }),
  z.object({
    action: z.literal('transcript.consent.choice'),
    choice: z.enum(['allow', 'decline']),
    version: z.literal(MEET_TRANSCRIPT_NOTICE_VERSION),
  }),
  // Recorded by the Meet Worker when the host's transcript session starts or
  // ends, so every participant sees the indicator.
  z.object({
    action: z.literal('transcript.session'),
    sessionId: z.uuid(),
    active: z.boolean(),
  }),
]);

const accountOf = (person: { accountId?: string; userId: string }) =>
  person.accountId ?? person.userId;

export function admittedTranscriptAccounts(state: RoomServiceState) {
  return [...new Set(Object.values(state.presence).map(accountOf))];
}

export function isCurrentTranscriptAllow(
  state: RoomServiceState,
  meetingId: string | undefined,
  accountId: string
) {
  const choice = state.transcriptConsent?.choices[accountId];
  return !!(
    meetingId &&
    choice &&
    choice.choice === 'allow' &&
    choice.accountId === accountId &&
    choice.meetingId === meetingId &&
    choice.version === MEET_TRANSCRIPT_NOTICE_VERSION &&
    Number.isSafeInteger(choice.revision) &&
    choice.revision > 0
  );
}

export function meetTranscriptFence(
  state: RoomServiceState,
  meetingId: string | undefined
): MeetTranscriptFence {
  const accounts = admittedTranscriptAccounts(state);
  const pending = accounts.filter(
    (accountId) => !isCurrentTranscriptAllow(state, meetingId, accountId)
  );
  const declined = pending.filter((accountId) => {
    const choice = state.transcriptConsent?.choices[accountId];
    return (
      choice?.choice === 'decline' &&
      choice.version === MEET_TRANSCRIPT_NOTICE_VERSION &&
      choice.meetingId === meetingId
    );
  }).length;
  return {
    ready: !state.ended && accounts.length > 0 && pending.length === 0,
    pending: pending.length,
    declined,
    admitted: accounts.length,
  };
}

function view(
  state: RoomServiceState,
  meetingId: string | undefined,
  accountId: string
): MeetTranscriptConsentView {
  const own = state.transcriptConsent?.choices[accountId];
  const active = state.ended ? undefined : state.transcriptConsent?.active;
  return {
    version: MEET_TRANSCRIPT_NOTICE_VERSION,
    choice:
      own?.version === MEET_TRANSCRIPT_NOTICE_VERSION &&
      own.meetingId === meetingId
        ? own.choice
        : null,
    fence: meetTranscriptFence(state, meetingId),
    active: !!active,
    activeSince: active?.since ?? null,
  };
}

/**
 * Handles transcript consent commands, or returns null for any other command.
 * Every command comes from the Meet Worker (`meet:server`) on behalf of the
 * signed-in or guest account in the token; nobody can choose for someone else.
 */
export function applyMeetTranscriptConsent(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now = Date.now()
): { state: RoomServiceState; body: unknown; status?: number } | null {
  const parsed = command.safeParse(input);
  if (!parsed.success) return null;
  if (!token.scopes.includes('meet:server'))
    return { state, body: { error: 'Forbidden' }, status: 403 };
  const accountId = token.accountId ?? token.userId;
  const meetingId = token.meetingId;
  const reply = (next: RoomServiceState) => ({
    state: next,
    body: view(next, meetingId, accountId),
  });
  const current = state.transcriptConsent ?? { choices: {} };
  if (parsed.data.action === 'transcript.session') {
    const { sessionId, active } = parsed.data;
    // Ending is always recorded, even after the host left, so the indicator
    // never outlives the session. Only the session's own host clears it.
    if (!active) {
      if (
        current.active?.sessionId !== sessionId ||
        current.active.accountId !== accountId
      )
        return reply(state);
      return reply({
        ...state,
        transcriptConsent: { choices: current.choices },
      });
    }
    if (state.ended || !admittedTranscriptAccounts(state).includes(accountId))
      return {
        state,
        body: { error: 'Join an active meeting first' },
        status: 403,
      };
    return reply({
      ...state,
      transcriptConsent: {
        ...current,
        active: { accountId, sessionId, since: now },
      },
    });
  }
  const admitted = admittedTranscriptAccounts(state).includes(accountId);
  if (!admitted || state.ended)
    return {
      state,
      body: { error: 'Join an active meeting first' },
      status: 403,
    };
  if (parsed.data.action === 'transcript.consent.read') {
    const { accounts: sources, sessionId } = parsed.data;
    const result = reply(state);
    if (!sources && !sessionId) return result;
    return {
      ...result,
      body: {
        ...result.body,
        ...(sources
          ? {
              sourcesAllowed: sources.every((source) =>
                isCurrentTranscriptAllow(state, meetingId, source)
              ),
            }
          : {}),
        ...(sessionId
          ? {
              sessionActive:
                !state.ended && current.active?.sessionId === sessionId,
            }
          : {}),
      },
    };
  }
  const choice = parsed.data.choice;
  const own = current.choices[accountId];
  if (
    own?.choice === choice &&
    own.version === MEET_TRANSCRIPT_NOTICE_VERSION &&
    own.meetingId === meetingId
  )
    return reply(state);
  return reply({
    ...state,
    transcriptConsent: {
      ...current,
      choices: {
        ...current.choices,
        [accountId]: {
          choice,
          version: MEET_TRANSCRIPT_NOTICE_VERSION,
          meetingId: meetingId ?? '',
          accountId,
          recordedAt: now,
          revision: (own?.revision ?? 0) + 1,
        },
      },
    },
  });
}
