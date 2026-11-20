import { describe, expect, it } from 'vitest';
import {
  type ChatRealtimeTicket,
  chatRealtimeBodyDigest,
  signChatRealtimeTicket,
  verifyChatRealtimeTicket,
} from './ticket';

const SECRET = 'test-only-chat-realtime-secret-0123456789';
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const nowSeconds = Math.floor(NOW / 1000);
const wsId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000001';
const conversationId = '00000000-0000-4000-8000-000000000003';

const inbox = (overrides: Partial<ChatRealtimeTicket> = {}) =>
  ({
    aud: 'chat-realtime',
    exp: nowSeconds + 600,
    iat: nowSeconds,
    kind: 'subscribe',
    room: 'inbox',
    userId,
    v: 1,
    wsId,
    ...overrides,
  }) as ChatRealtimeTicket;

describe('chat realtime tickets', () => {
  it('round-trips subscribe and publish tickets', async () => {
    const token = await signChatRealtimeTicket(inbox(), SECRET);
    expect(await verifyChatRealtimeTicket(token, SECRET, NOW)).toEqual(inbox());

    const bodySha256 = await chatRealtimeBodyDigest('{"x":1}');
    const publish = {
      aud: 'chat-realtime',
      bodySha256,
      exp: nowSeconds + 60,
      iat: nowSeconds,
      kind: 'publish',
      v: 1,
      wsId,
    } as const;
    const publishToken = await signChatRealtimeTicket(publish, SECRET);
    expect(await verifyChatRealtimeTicket(publishToken, SECRET, NOW)).toEqual(
      publish
    );
  });

  it('rejects a wrong secret, tampering and malformed input', async () => {
    const token = await signChatRealtimeTicket(inbox(), SECRET);
    expect(
      await verifyChatRealtimeTicket(token, `${SECRET}-other`, NOW)
    ).toBeNull();

    const [payload, signature] = token.split('.') as [string, string];
    const forged = btoa(JSON.stringify({ ...inbox(), userId: wsId })).replace(
      /=+$/u,
      ''
    );
    expect(
      await verifyChatRealtimeTicket(`${forged}.${signature}`, SECRET, NOW)
    ).toBeNull();
    expect(
      await verifyChatRealtimeTicket(`${payload}.${signature}x`, SECRET, NOW)
    ).toBeNull();
    for (const bad of ['', 'a', 'a.b.c', `${payload}.`, '!!.??']) {
      expect(await verifyChatRealtimeTicket(bad, SECRET, NOW)).toBeNull();
    }
    expect(
      await verifyChatRealtimeTicket('a'.repeat(5000), SECRET, NOW)
    ).toBeNull();
  });

  it('enforces expiry, issue time and per-kind lifetime', async () => {
    const token = await signChatRealtimeTicket(inbox(), SECRET);
    expect(
      await verifyChatRealtimeTicket(token, SECRET, NOW + 601_000)
    ).toBeNull();
    const future = await signChatRealtimeTicket(
      inbox({ exp: nowSeconds + 700, iat: nowSeconds + 120 }),
      SECRET
    );
    expect(await verifyChatRealtimeTicket(future, SECRET, NOW)).toBeNull();
    await expect(
      signChatRealtimeTicket(inbox({ exp: nowSeconds + 16 * 60 }), SECRET)
    ).rejects.toThrow(/lifetime/u);
  });

  it('binds conversation ids to the room kind', async () => {
    await expect(
      signChatRealtimeTicket(inbox({ conversationId }), SECRET)
    ).rejects.toThrow();
    await expect(
      signChatRealtimeTicket(inbox({ room: 'conversation' }), SECRET)
    ).rejects.toThrow();
    const token = await signChatRealtimeTicket(
      inbox({ conversationId, room: 'conversation' }),
      SECRET
    );
    expect(await verifyChatRealtimeTicket(token, SECRET, NOW)).toMatchObject({
      conversationId,
      room: 'conversation',
    });
  });

  it('refuses short secrets on both sides', async () => {
    await expect(signChatRealtimeTicket(inbox(), 'short')).rejects.toThrow(
      /at least/u
    );
    await expect(verifyChatRealtimeTicket('a.b', 'short')).rejects.toThrow(
      /at least/u
    );
  });

  it('does not accept legacy sidecar tokens', async () => {
    const { signChatRealtimeToken } = await import('./token');
    const legacy = signChatRealtimeToken(
      { exp: nowSeconds + 60, scopes: ['subscribe'], userId, wsId },
      SECRET
    );
    expect(await verifyChatRealtimeTicket(legacy, SECRET, NOW)).toBeNull();
  });
});
