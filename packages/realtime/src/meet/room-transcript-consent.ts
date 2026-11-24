import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import { MEET_CLASS_COHOST_SCOPE } from './class-timer';
import { isMiraNoticeStale } from './room-mira-choices';
import type { RoomServiceState } from './room-service';
import {
  isSelfSessionCapturing,
  isSelfSessionLive,
} from './room-self-capture-state';

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
  /** Capture mode: host room capture, or each person's own device. */
  mode?: 'room' | 'self';
  session?: {
    sessionId: string;
    protocol: 'legacy' | 'self_v1';
    generation: number;
  } | null;
  /** Host or co-host may change the mode. */
  canManageMode?: boolean;
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
    choice.revision > 0 &&
    // Mira on under another transcript notice counts as undecided here, so
    // room capture pauses for everyone until the person confirms again.
    !isMiraNoticeStale(state, accountId)
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

function sessionView(
  state: RoomServiceState,
  now: number
): NonNullable<MeetTranscriptConsentView['session']> | null {
  const self = state.selfCapture?.session;
  if (!state.ended && isSelfSessionLive(self, now))
    return {
      sessionId: self.sessionId,
      protocol: 'self_v1',
      generation: self.generation,
    };
  const active = state.ended ? undefined : state.transcriptConsent?.active;
  // An ended or expired self_v1 session never shows as a legacy one.
  return active && active.sessionId !== self?.sessionId
    ? { sessionId: active.sessionId, protocol: 'legacy', generation: 0 }
    : null;
}

/** A recorded self_v1 session never admits room-mix chunks. */
const isSelfSession = (state: RoomServiceState, sessionId: string) =>
  state.selfCapture?.session?.sessionId === sessionId;

function view(
  state: RoomServiceState,
  meetingId: string | undefined,
  accountId: string,
  token?: MeetRealtimeTokenPayload,
  now = Date.now()
): MeetTranscriptConsentView {
  const own = state.transcriptConsent?.choices[accountId];
  const indicator = state.ended ? undefined : state.transcriptConsent?.active;
  const self = state.selfCapture?.session;
  // A self_v1 session shows as running only while it is live and active.
  const active =
    indicator?.sessionId === self?.sessionId &&
    !isSelfSessionCapturing(self, now)
      ? undefined
      : indicator;
  return {
    mode: state.selfCapture?.mode ?? 'room',
    session: sessionView(state, now),
    canManageMode:
      !!token &&
      token.guest !== true &&
      token.participantKind !== 'guest' &&
      (token.role === 'host' || token.scopes.includes(MEET_CLASS_COHOST_SCOPE)),
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

/** The transcript consent view of the token's own account. */
export function meetTranscriptConsentView(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  now = Date.now()
) {
  return view(
    state,
    token.meetingId,
    token.accountId ?? token.userId,
    token,
    now
  );
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
    body: view(next, meetingId, accountId, token, now),
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
                !state.ended &&
                current.active?.sessionId === sessionId &&
                !isSelfSession(state, sessionId),
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
