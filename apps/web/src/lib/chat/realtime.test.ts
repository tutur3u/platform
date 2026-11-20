import { afterEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/realtime/chat/token', () => ({
  signChatRealtimeToken: vi.fn(() => 'test-token'),
}));

import { signChatRealtimeToken } from '@tuturuuu/realtime/chat/token';
import {
  getChatRealtimeInternalBaseUrl,
  getChatRealtimeSubscribeUrl,
  publishChatRealtimeEvent,
} from './realtime';

const id = 'a6742000-0000-4000-8000-000000000021';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('skips signing and network traffic in production without a configured URL', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('CHAT_REALTIME_INTERNAL_URL', '');
  vi.stubEnv('CHAT_REALTIME_URL', undefined);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);

  expect(getChatRealtimeInternalBaseUrl()).toBeNull();
  expect(getChatRealtimeSubscribeUrl({ userId: id, wsId: id })).toBeNull();

  const event = {
    actorUserId: id,
    audience: { scope: 'workspace' },
    conversationId: id,
    result: { id },
    type: 'conversation.deleted',
    wsId: id,
  } satisfies Parameters<typeof publishChatRealtimeEvent>[0];
  await publishChatRealtimeEvent(event);
  await publishChatRealtimeEvent(event);

  expect(signChatRealtimeToken).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledTimes(1);
});

it('uses the legacy upstream only in local development', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('CHAT_REALTIME_INTERNAL_URL', undefined);
  vi.stubEnv('CHAT_REALTIME_URL', undefined);
  vi.stubEnv('CHAT_REALTIME_TOKEN_SECRET', 'test-secret');

  expect(
    getChatRealtimeSubscribeUrl({ userId: id, wsId: id })?.url.origin
  ).toBe('http://localhost:7817');

  vi.stubEnv('CHAT_REALTIME_INTERNAL_URL', 'https://realtime.example.test/');
  expect(getChatRealtimeSubscribeUrl({ userId: id, wsId: id })?.url.href).toBe(
    'https://realtime.example.test/realtime?token=test-token'
  );

  vi.stubEnv('NODE_ENV', 'production');
  expect(getChatRealtimeSubscribeUrl({ userId: id, wsId: id })).toBeNull();
});
