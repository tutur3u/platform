// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/realtime/chat/token', () => ({
  signChatRealtimeToken: () => 'synthetic-signature',
}));

import { publishChatRealtimeEvent } from './realtime';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it('passes the caller deadline to realtime fetch and observes cancellation without retry', async () => {
  vi.stubEnv('CHAT_REALTIME_TOKEN_SECRET', 'synthetic-test-secret');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const controller = new AbortController();
  const fetch = vi.fn(async (_url: unknown, options?: RequestInit) => {
    if (!options?.signal) return Response.json({}); // Baseline terminates for RED.
    return new Promise<Response>((_resolve, reject) => {
      options.signal!.addEventListener(
        'abort',
        () => reject(new DOMException('Synthetic abort', 'AbortError')),
        { once: true }
      );
    });
  });
  vi.stubGlobal('fetch', fetch);
  const id = 'a6742000-0000-4000-8000-000000000021';
  const pending = publishChatRealtimeEvent(
    {
      actorUserId: 'a6742000-0000-4000-8000-000000000001',
      wsId: 'a6742000-0000-4000-8000-000000000011',
      conversationId: id,
      audience: {
        scope: 'users',
        userIds: ['a6742000-0000-4000-8000-000000000001'],
      },
      type: 'conversation.deleted',
      result: { id },
    },
    { signal: controller.signal }
  );
  try {
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  } finally {
    controller.abort();
    await pending;
  }
  expect(fetch).toHaveBeenCalledTimes(1);
});
