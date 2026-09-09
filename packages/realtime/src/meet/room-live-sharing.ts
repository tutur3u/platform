import { z } from 'zod';
import { MEET_ASSISTANT_USER_ID } from './assistant-mentions';
import type { MeetRealtimeTokenPayload } from './primitives';
import { retainRoomChat } from './room-chat';
import type { RoomChatMessage, RoomServiceState } from './room-service';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('live.share.finish'), id: z.uuid() }),
  z.object({
    action: z.literal('live.share'),
    id: z.uuid(),
    text: z.string().trim().min(1).max(4000),
  }),
  z.object({
    action: z.literal('live.share.audio'),
    id: z.uuid(),
    sequence: z.number().int().nonnegative(),
    data: z.string().min(1).max(48000),
    at: z.number(),
  }),
]);
export function applyLiveSharing(
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now = Date.now()
) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return null;
  const ownerId = token.accountId ?? token.userId;
  const fail = (error: string, status = 403) => ({
    state: snapshot,
    body: { error },
    status,
  });
  if (
    !token.scopes.includes('meet:live-server') ||
    snapshot.ended ||
    !Object.values(snapshot.presence).some(
      (p) => (p.accountId ?? p.userId) === ownerId
    )
  )
    return fail('Forbidden');
  const message = parsed.data;
  const shares = Object.fromEntries(
    Object.entries(snapshot.liveShares ?? {}).filter(
      ([, entry]) => entry.expiresAt > now
    )
  );
  if (message.action === 'live.share') {
    if (shares[message.id])
      return shares[message.id]?.ownerId === ownerId
        ? { state: snapshot, body: { ok: true } }
        : fail('Forbidden');
    if (Object.values(shares).some((entry) => entry.ownerId === ownerId))
      return fail('A shared reply is already playing', 409);
    const entry: RoomChatMessage = {
      type: 'chat.message',
      id: message.id,
      userId: MEET_ASSISTANT_USER_ID,
      assistant: true,
      displayName: 'Mira',
      body: message.text,
      createdAt: new Date(now).toISOString(),
      retained: snapshot.settings?.saveChat !== false,
    };
    return {
      state: {
        ...snapshot,
        liveShares: {
          ...shares,
          [message.id]: { ownerId, expiresAt: now + 120000, sequence: -1 },
        },
        chat: retainRoomChat([...(snapshot.chat ?? []), entry]),
      },
      body: { ok: true },
      messages: [entry],
    };
  }
  const grant = shares[message.id];
  if (!grant || grant.ownerId !== ownerId)
    return fail('Shared reply expired', 409);
  if (message.action === 'live.share.finish') {
    delete shares[message.id];
    return { state: { ...snapshot, liveShares: shares }, body: { ok: true } };
  }
  if (Math.abs(now - message.at) > 5000 || message.sequence <= grant.sequence)
    return { state: snapshot, body: { ok: true } };
  return {
    state: {
      ...snapshot,
      liveShares: {
        ...shares,
        [message.id]: { ...grant, sequence: message.sequence },
      },
    },
    body: { ok: true },
    messages: [
      {
        type: 'assistant.audio' as const,
        sessionId: message.id,
        sequence: message.sequence,
        data: message.data,
        at: message.at,
      },
    ],
  };
}
