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

import { callRoomService } from './room-service';

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
