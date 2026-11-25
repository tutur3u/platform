// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  WorkspaceStorageError: class extends Error {},
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  AccountServiceError: class extends Error {},
}));
vi.mock('../lib/call-access', () => ({
  getMeetCallAccess: vi.fn(),
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string,
      public retryAfterSeconds?: number
    ) {
      super(message);
    }
  },
}));
vi.mock('../lib/call-session', () => ({
  getMeetCallSession: async () => ({
    realtimeUrl: 'wss://realtime.test/realtime',
    token: 'synthetic-test',
  }),
}));
vi.mock('../lib/guest-access', () => ({ getMeetGuestCallAccess: vi.fn() }));
vi.mock('../lib/guest-session', () => ({ MEET_GUEST_COOKIE: 'guest' }));

import {
  callRoomService,
  parseRetryAfter,
  wasFailureLogged,
} from './room-service';

const access = {
  meeting: { id: 'meeting', ws_id: 'ws' },
  user: { id: 'user' },
  isHost: true,
  displayName: 'Host',
  admission: 'open',
  canReadWorkspace: true,
} as never;
const ok = () => Response.json({ recordings: [] });
const status = (code: number) => new Response('boom', { status: code });

afterEach(() => vi.unstubAllGlobals());

it('repeats a read once when the room answers 5xx while ending', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(status(500))
    .mockResolvedValueOnce(ok());
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    callRoomService(access, { action: 'recording.list' }, { retryRead: true })
  ).resolves.toEqual({ recordings: [] });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('does not repeat a command that is not a read', async () => {
  const fetchMock = vi.fn().mockResolvedValue(status(500));
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    callRoomService(access, { action: 'recording.save' })
  ).rejects.toMatchObject({ status: 500, retryAfterSeconds: undefined });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('leaves a dropped request from a non-read command as it was', async () => {
  const dropped = new TypeError('fetch failed');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(dropped));
  await expect(
    callRoomService(access, { action: 'recording.save' })
  ).rejects.toBe(dropped);
});

it('marks a read that still fails with 5xx as retryable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(status(500)));
  await expect(
    callRoomService(access, { action: 'recording.list' }, { retryRead: true })
  ).rejects.toMatchObject({ status: 500, retryAfterSeconds: 1 });
});

it('does not repeat a refusal', async () => {
  const fetchMock = vi.fn().mockResolvedValue(status(403));
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    callRoomService(access, { action: 'recording.list' }, { retryRead: true })
  ).rejects.toMatchObject({ status: 403, retryAfterSeconds: undefined });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('reports a room that stays unreachable as retryable, not a 500', async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValue(new DOMException('t', 'TimeoutError'));
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    callRoomService(access, { action: 'recording.list' }, { retryRead: true })
  ).rejects.toMatchObject({ status: 503, retryAfterSeconds: 1 });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('keeps a fixed refusal code from the room, never its message', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { code: 'MEET_SELF_SESSION_LIVE', error: 'room text' },
          { status: 409 }
        )
      )
  );
  const error = await callRoomService(access, {
    action: 'transcript.session',
  }).catch((caught: unknown) => caught);
  expect(error).toMatchObject({
    status: 409,
    code: 'MEET_SELF_SESSION_LIVE',
    message: 'Room action is unavailable',
  });
});

it('drops a refusal code outside the allowlist or a missing one', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ code: 'SOME_INTERNAL_CODE' }, { status: 403 })
      )
      .mockResolvedValueOnce(new Response('plain', { status: 400 }))
  );
  for (let index = 0; index < 2; index++)
    await expect(
      callRoomService(access, { action: 'transcript.session' })
    ).rejects.toMatchObject({ code: undefined });
});

it('forwards the room Mira notice-mode refusal code', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ code: 'MIRA_ROOM_NOTICE_MODE_STALE' }, { status: 409 })
      )
  );
  await expect(
    callRoomService(access, { action: 'mira.room.choice' })
  ).rejects.toMatchObject({ status: 409, code: 'MIRA_ROOM_NOTICE_MODE_STALE' });
});

it.each([
  [429, '12', 12],
  [503, '0', 1],
  // A date already past reads as one second.
  [503, 'Wed, 21 Oct 2015 07:28:30 GMT', 1],
  [500, 'soon', undefined],
  [409, '12', undefined],
])(
  'passes a %s Retry-After of %s through as %s seconds',
  async (code, header, retryAfterSeconds) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          status: code,
          headers: { 'Retry-After': header },
        })
      )
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      callRoomService(access, { action: 'personal.begin' })
    ).rejects.toMatchObject({ status: code, retryAfterSeconds });
    errors.mockRestore();
  }
);

it('reads Retry-After as delay seconds or an HTTP date, within an hour', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  expect(parseRetryAfter('30', now)).toBe(30);
  expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:10 GMT', now)).toBe(10);
  expect(parseRetryAfter('86400', now)).toBe(3600);
  expect(parseRetryAfter('soon', now)).toBeUndefined();
  expect(parseRetryAfter(null, now)).toBeUndefined();
});

it('logs each room failure once and marks it as logged', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failure = (call: Promise<unknown>) =>
    call.then(
      () => {
        throw new Error('expected a failure');
      },
      (error: unknown) => error
    );
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(status(503)));
  const failed = await failure(
    callRoomService(access, { action: 'personal.begin' })
  );
  expect(failed).toMatchObject({ status: 503, action: 'personal.begin' });
  expect(wasFailureLogged(failed)).toBe(true);
  expect(errors).toHaveBeenCalledTimes(1);
  // A dropped request a caller may swallow is logged and marked too.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('dropped')));
  const dropped = await failure(
    callRoomService(access, { action: 'personal.finish' })
  );
  expect(dropped).toBeInstanceOf(TypeError);
  expect(wasFailureLogged(dropped)).toBe(true);
  expect(errors).toHaveBeenCalledTimes(2);
  // A refusal is not a failure: neither logged nor marked.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(status(429)));
  const busy = await failure(
    callRoomService(access, { action: 'personal.begin' })
  );
  expect(wasFailureLogged(busy)).toBe(false);
  expect(errors).toHaveBeenCalledTimes(2);
  errors.mockRestore();
});
