import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import { meetPresenceMessage } from './room';
import type { RoomServiceState } from './room-service';

export const MIRA_PRIVATE_NOTICE_VERSION = '2026-11-13-private-v1';
export const MIRA_ROOM_DENIED =
  'Room Mira is unavailable. Use Private Mira after choosing Continue.';
export type MiraPrivateState = {
  choices: Record<
    string,
    {
      choice: 'continue' | 'mute' | 'leave';
      version: string;
      meetingId: string;
      accountId: string;
      recordedAt: number;
      revision: number;
    }
  >;
  sessions: Record<string, string[]>;
};

const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mira.private.read') }),
  z.object({
    action: z.literal('mira.private.choice'),
    choice: z.enum(['continue', 'mute', 'leave']),
    version: z.literal(MIRA_PRIVATE_NOTICE_VERSION),
  }),
  z.object({ action: z.literal('mira.private.register'), sessionId: z.uuid() }),
  z.object({ action: z.literal('mira.private.ended'), sessionId: z.uuid() }),
]);

export function applyPrivateMira(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now = Date.now()
) {
  const parsed = command.safeParse(input);
  if (!parsed.success) return null;
  const message = parsed.data;
  const accountId = token.accountId ?? token.userId;
  const current = state.miraPrivate ?? { choices: {}, sessions: {} };
  const ownChoice = current.choices[accountId];
  const sessions = current.sessions[accountId] ?? [];
  const admitted = Object.values(state.presence).some(
    (person) => (person.accountId ?? person.userId) === accountId
  );
  const fail = (error: string, status = 403) => ({
    state,
    body: { error },
    status,
  });
  if (message.action === 'mira.private.ended') {
    const remaining = sessions.filter((id) => id !== message.sessionId);
    const presence = Object.fromEntries(
      Object.entries(state.presence).map(([id, person]) => [
        id,
        (person.accountId ?? person.userId) === accountId
          ? { ...person, miraPrivate: remaining.length > 0 }
          : person,
      ])
    );
    const next = {
      ...state,
      presence,
      miraPrivate: {
        ...current,
        sessions: { ...current.sessions, [accountId]: remaining },
      },
    };
    return {
      state: next,
      body: { ok: true },
      messages: [meetPresenceMessage(next, token.roomId)],
    };
  }
  if (!admitted || state.ended) return fail('Join an active meeting first');
  if (message.action === 'mira.private.read')
    return {
      state,
      body: {
        version: MIRA_PRIVATE_NOTICE_VERSION,
        choice: ownChoice ?? null,
        sessions,
        admitted: true,
      },
    };
  if (message.action === 'mira.private.choice') {
    if (message.choice !== 'continue' && sessions.length)
      return fail('Stop private Mira before changing the choice', 409);
    if (
      ownChoice?.choice === message.choice &&
      ownChoice.version === MIRA_PRIVATE_NOTICE_VERSION
    )
      return {
        state,
        body: {
          version: MIRA_PRIVATE_NOTICE_VERSION,
          choice: ownChoice,
          sessions,
          admitted: true,
        },
      };
    const record = {
      choice: message.choice,
      version: MIRA_PRIVATE_NOTICE_VERSION,
      meetingId: token.meetingId ?? '',
      accountId,
      recordedAt: now,
      revision: (ownChoice?.revision ?? 0) + 1,
    };
    return {
      state: {
        ...state,
        miraPrivate: {
          ...current,
          choices: { ...current.choices, [accountId]: record },
        },
      },
      body: {
        version: MIRA_PRIVATE_NOTICE_VERSION,
        choice: record,
        sessions,
        admitted: true,
      },
    };
  }
  if (
    ownChoice?.choice !== 'continue' ||
    ownChoice.version !== MIRA_PRIVATE_NOTICE_VERSION ||
    ownChoice.meetingId !== token.meetingId
  )
    return fail('Choose Continue with Mira before starting');
  if (!sessions.includes(message.sessionId) && sessions.length >= 2)
    return fail('Stop an existing private Mira session first', 409);
  const presence = Object.fromEntries(
    Object.entries(state.presence).map(([id, person]) => [
      id,
      (person.accountId ?? person.userId) === accountId
        ? { ...person, miraPrivate: true }
        : person,
    ])
  );
  const next = {
    ...state,
    presence,
    miraPrivate: {
      ...current,
      sessions: {
        ...current.sessions,
        [accountId]: [...new Set([...sessions, message.sessionId])],
      },
    },
  };
  return {
    state: next,
    body: { ok: true },
    messages: [meetPresenceMessage(next, token.roomId)],
  };
}
