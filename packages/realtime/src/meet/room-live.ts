import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { RoomServiceState } from './room-service';

export const roomLiveCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('live.reserve'), sessionId: z.uuid() }),
  z.object({ action: z.literal('live.stop'), sessionId: z.uuid() }),
  z.object({ action: z.literal('live.heartbeat'), sessionId: z.uuid() }),
  z.object({
    action: z.literal('live.audio'),
    sessionId: z.uuid(),
    sequence: z.number().int().nonnegative(),
    data: z.string().min(1).max(48000),
    at: z.number(),
  }),
  z.object({ action: z.literal('live.context') }),
]);
export type RoomLiveState = {
  sessionId: string;
  ownerId: string;
  expiresAt: number;
  sequence: number;
};
export function applyRoomLive(
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now = Date.now()
) {
  const parsed = roomLiveCommand.safeParse(input);
  if (!parsed.success) return null;
  const message = parsed.data;
  const ownerId = token.accountId ?? token.userId;
  const admitted = Object.values(snapshot.presence).some(
    (p) => (p.accountId ?? p.userId) === ownerId
  );
  const fail = (error: string, status = 403) => ({
    state: snapshot,
    body: { error },
    status,
  });
  if (!admitted || snapshot.ended) return fail('Join an active meeting first');
  if (message.action === 'live.context')
    return {
      state: snapshot,
      body: {
        participants: Object.values(snapshot.presence).map(
          ({ displayName, role }) => ({ displayName, role })
        ),
        chat: (snapshot.chat ?? [])
          .slice(-40)
          .map(({ displayName, body }) => ({ displayName, body })),
        live: snapshot.liveAssistant,
      },
    };
  if (message.action === 'live.reserve') {
    if (token.role !== 'host')
      return fail('Only a room admin can invite the room assistant');
    const current = snapshot.liveAssistant;
    if (
      current &&
      current.expiresAt > now &&
      current.sessionId !== message.sessionId
    )
      return fail('A room assistant is already active', 409);
    const liveAssistant = {
      sessionId: message.sessionId,
      ownerId,
      expiresAt: now + 90_000,
      sequence: -1,
    };
    return {
      state: { ...snapshot, liveAssistant },
      body: { ok: true },
      messages: [
        {
          type: 'assistant.live' as const,
          sessionId: message.sessionId,
          ownerId,
          active: true,
        },
      ],
    };
  }
  const current = snapshot.liveAssistant;
  if (
    !current ||
    current.sessionId !== message.sessionId ||
    current.expiresAt <= now
  )
    return fail('Room assistant session expired', 409);
  if (message.action === 'live.stop') {
    if (token.role !== 'host' && ownerId !== current.ownerId)
      return fail('Forbidden');
    return {
      state: { ...snapshot, liveAssistant: undefined },
      body: { ok: true },
      messages: [
        {
          type: 'assistant.live' as const,
          sessionId: message.sessionId,
          ownerId,
          active: false,
        },
      ],
    };
  }
  // A browser token, including a host token, never has this scope.
  if (!token.scopes.includes('meet:live-server') || ownerId !== current.ownerId)
    return fail('Forbidden');
  if (message.action === 'live.heartbeat')
    return {
      state: {
        ...snapshot,
        liveAssistant: { ...current, expiresAt: now + 90_000 },
      },
      body: { ok: true },
    };
  if (Math.abs(now - message.at) > 5000 || message.sequence <= current.sequence)
    return { state: snapshot, body: { ok: true } };
  return {
    state: {
      ...snapshot,
      liveAssistant: { ...current, sequence: message.sequence },
    },
    body: { ok: true },
    messages: [
      {
        type: 'assistant.audio' as const,
        sessionId: current.sessionId,
        sequence: message.sequence,
        data: message.data,
        at: message.at,
      },
    ],
  };
}
