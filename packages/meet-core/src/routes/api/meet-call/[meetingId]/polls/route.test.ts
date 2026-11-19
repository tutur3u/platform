import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  session: vi.fn(),
  fetch: vi.fn(),
  action: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/guest-access', () => ({
  getMeetGuestCallAccess: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  WorkspaceStorageError: class extends Error {},
}));
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  AccountServiceError: class extends Error {},
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  getMeetCallAccess: mocks.access,
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('../../../../../features/call/lib/call-session', () => ({
  getMeetCallSession: mocks.session,
}));
vi.mock('../../../../../features/call/server/polls', async () => {
  const { pollMutationSchema } =
    await import('@tuturuuu/realtime/meet/room-polls');
  return { pollActionSchema: pollMutationSchema, runPollAction: mocks.action };
});

import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { GET, POST } from './route';

const id = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
const url = `https://meet.test/api/meet-call/${id}/polls`;
const params = { params: Promise.resolve({ meetingId: id }) };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.access.mockResolvedValue({
    user: { id: 'host' },
    meeting: { id, ws_id: 'workspace' },
    displayName: 'Host',
    isHost: true,
    canReadWorkspace: true,
  });
  mocks.session.mockResolvedValue({
    realtimeUrl: 'wss://rt.test/socket',
    token: 'test-token',
  });
});

afterEach(() => vi.unstubAllGlobals());

it('reads the authorized room projection without caching', async () => {
  mocks.fetch.mockResolvedValue(Response.json({ canManage: true, polls: [] }));
  const response = await GET(new Request(url), params);
  expect(await response.json()).toEqual({ canManage: true, polls: [] });
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(mocks.access).toHaveBeenCalledWith(id, 'Participant');
  expect(mocks.fetch.mock.calls[0]?.[1].body).toBe('{"action":"poll.list"}');
});

it.each([401, 403, 404, 500])(
  'propagates access status %d without reaching the room',
  async (status) => {
    mocks.access.mockRejectedValue(
      new MeetCallAccessError(status, 'Unavailable')
    );
    expect((await GET(new Request(url), params)).status).toBe(status);
    expect(mocks.session).not.toHaveBeenCalled();
  }
);

it.each(['csv', 'json'] as const)(
  'downloads an authorized %s attachment and propagates manager denial',
  async (format) => {
    const value = format === 'csv' ? '"question","Test"' : { question: 'Test' };
    mocks.fetch
      .mockResolvedValueOnce(Response.json(value))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    const request = new Request(`${url}?format=${format}&pollId=${id}`);
    const response = await GET(request, params);
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="poll-${id}.${format}"`
    );
    expect(await response.text()).toBe(
      typeof value === 'string' ? value : JSON.stringify(value)
    );
    expect((await GET(request, params)).status).toBe(403);
  }
);

it('rejects invalid and duplicate export query parameters', async () => {
  expect(
    (await GET(new Request(`${url}?format=csv&pollId=bad`), params)).status
  ).toBe(400);
  expect(
    (
      await GET(
        new Request(`${url}?format=csv&format=json&pollId=${id}`),
        params
      )
    ).status
  ).toBe(400);
  expect(mocks.session).not.toHaveBeenCalled();
});

it('blocks cross-origin mutations and validates request bodies before dispatch', async () => {
  const vote = {
    action: 'vote',
    pollId: id,
    response: { type: 'rating', rating: 5 },
  };
  const post = (input: unknown, origin = 'https://meet.test') =>
    POST(
      new Request(url, {
        method: 'POST',
        headers: { origin },
        body: JSON.stringify(input),
      }),
      params
    );
  expect((await post(vote, 'https://foreign.test')).status).toBe(403);
  expect(mocks.access).not.toHaveBeenCalled();
  expect((await post({ ...vote, userId: 'spoofed' })).status).toBe(400);
  expect((await post({ ...vote, padding: 'x'.repeat(8192) })).status).toBe(400);
  expect(mocks.action).not.toHaveBeenCalled();
  mocks.action.mockResolvedValue({ ok: true });
  expect((await post(vote)).status).toBe(200);
  expect(mocks.action).toHaveBeenCalledOnce();
  expect(mocks.action.mock.calls[0]?.[1]).toEqual(vote);
});
