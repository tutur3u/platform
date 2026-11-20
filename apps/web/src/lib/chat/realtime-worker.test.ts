import {
  chatRealtimeBodyDigest,
  verifyChatRealtimeTicket,
} from '@tuturuuu/realtime/chat/ticket';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/realtime/chat/token', () => ({
  signChatRealtimeToken: vi.fn(() => 'legacy-token'),
}));

import { signChatRealtimeToken } from '@tuturuuu/realtime/chat/token';
import {
  getChatRealtimeSubscribeUrl,
  publishChatRealtimeEvent,
} from './realtime';
import { createChatRealtimeSubscribeTicket } from './realtime-worker';

const wsId = 'a6742000-0000-4000-8000-000000000011';
const userId = 'a6742000-0000-4000-8000-000000000001';
const conversationId = 'a6742000-0000-4000-8000-000000000021';
const workerSecret = 'synthetic-worker-test-secret-at-least-32-characters';
const event = {
  actorUserId: userId,
  audience: { scope: 'users', userIds: [userId] },
  conversationId,
  result: { id: conversationId },
  type: 'conversation.deleted',
  wsId,
} satisfies Parameters<typeof publishChatRealtimeEvent>[0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('CHAT_REALTIME_URL', 'https://realtime.example.test/');
  vi.stubEnv('CHAT_REALTIME_INTERNAL_URL', 'http://internal.example.test');
  vi.stubEnv('CHAT_REALTIME_TOKEN_SECRET', workerSecret);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each([undefined, 'short'])(
  'refuses all signing and publishing when only a service key can sign',
  async (dedicatedSecret) => {
    vi.stubEnv('CHAT_REALTIME_TOKEN_SECRET', dedicatedSecret);
    for (const key of [
      'SUPABASE_SECRET_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SERVICE_KEY',
    ]) {
      vi.stubEnv(key, 'synthetic-service-key-at-least-32-characters');
    }
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(
      createChatRealtimeSubscribeTicket({ wsId, userId })
    ).resolves.toBeNull();
    expect(getChatRealtimeSubscribeUrl({ wsId, userId })).toBeNull();
    await expect(publishChatRealtimeEvent(event)).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(signChatRealtimeToken).not.toHaveBeenCalled();
  }
);

it('unsetting the Worker origin stops minting and Cloudflare publish traffic', async () => {
  vi.stubEnv('CHAT_REALTIME_URL', undefined);
  vi.stubEnv('CHAT_REALTIME_INTERNAL_URL', undefined);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);

  await expect(
    createChatRealtimeSubscribeTicket({ wsId, userId })
  ).resolves.toBeNull();
  await expect(publishChatRealtimeEvent(event)).resolves.toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});

it('issues a limited ticket for the requested conversation', async () => {
  const result = await createChatRealtimeSubscribeTicket({
    conversationId,
    userId,
    wsId,
  });
  if (!result) throw new Error('Expected a subscribe ticket');
  expect(result.url).toBe('wss://realtime.example.test/v1/connect');
  const claims = await verifyChatRealtimeTicket(result.ticket, workerSecret);
  expect(claims).toMatchObject({
    conversationId,
    kind: 'subscribe',
    room: 'conversation',
    userId,
    wsId,
  });
  if (!claims) throw new Error('Expected valid claims');
  expect(claims.exp - claims.iat).toBe(900);
  expect(result.expiresAt).toEqual(new Date(claims.exp * 1_000).toISOString());
});

it('publishes with a dedicated, body-bound ticket and returns foreground recipients', async () => {
  const fetch = vi.fn(async (_url: URL, request: RequestInit) => {
    const headers = new Headers(request.headers);
    const token = headers.get('authorization')?.split(' ')[1];
    if (!token || typeof request.body !== 'string') {
      throw new Error('Expected a token and body');
    }
    const claims = await verifyChatRealtimeTicket(token, workerSecret);
    expect(claims).toMatchObject({
      bodySha256: await chatRealtimeBodyDigest(request.body),
      kind: 'publish',
      wsId,
    });
    if (!claims) throw new Error('Expected valid claims');
    expect(claims.exp - claims.iat).toBe(60);
    return Response.json({ foregroundUserIds: [userId], ok: true, seq: 1 });
  });
  vi.stubGlobal('fetch', fetch);

  await expect(publishChatRealtimeEvent(event)).resolves.toEqual([userId]);
  expect(fetch).toHaveBeenCalledWith(
    new URL('https://realtime.example.test/v1/publish'),
    expect.objectContaining({ method: 'POST', redirect: 'error' })
  );
  expect(signChatRealtimeToken).not.toHaveBeenCalled();
});
