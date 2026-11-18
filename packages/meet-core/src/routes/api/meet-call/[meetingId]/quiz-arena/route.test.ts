import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  session: vi.fn(),
  fetch: vi.fn(),
  action: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
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
vi.mock('../../../../../features/call/server/quiz-arena', async () => {
  const { quizArenaMutationSchema } =
    await import('@tuturuuu/realtime/meet/room-quiz-arena');
  return {
    quizArenaActionSchema: quizArenaMutationSchema,
    runQuizArenaAction: mocks.action,
  };
});

import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { GET, POST } from './route';

const id = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
const tileId = '9987d372-ee63-4228-8b17-3757ca5d1ccf';
const url = `https://meet.test/api/meet-call/${id}/quiz-arena`;
const params = { params: Promise.resolve({ meetingId: id }) };
const body = (init: RequestInit) => JSON.parse(String(init.body));

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

it('reads full and incremental projections without caching', async () => {
  mocks.fetch.mockImplementation(async () => Response.json({ kind: 'empty' }));
  const response = await GET(new Request(url), params);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(body(mocks.fetch.mock.calls[0]?.[1])).toEqual({
    action: 'arena.state',
  });
  await GET(new Request(`${url}?sinceSeq=12`), params);
  expect(body(mocks.fetch.mock.calls[1]?.[1])).toEqual({
    action: 'arena.state',
    sinceSeq: 12,
  });
  expect(mocks.access).toHaveBeenCalledWith(id, 'Participant');
});

it.each([401, 403, 404])('propagates access status %d', async (status) => {
  mocks.access.mockRejectedValue(
    new MeetCallAccessError(status, 'Unavailable')
  );
  expect((await GET(new Request(url), params)).status).toBe(status);
  expect(mocks.session).not.toHaveBeenCalled();
});

it.each(['csv', 'json'] as const)(
  'downloads a %s export as an attachment',
  async (format) => {
    mocks.fetch
      .mockResolvedValueOnce(
        Response.json(format === 'csv' ? '"title","Quiz"' : { title: 'Quiz' })
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    const request = new Request(`${url}?format=${format}`);
    const response = await GET(request, params);
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="quiz-arena-${id}.${format}"`
    );
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect((await GET(request, params)).status).toBe(403);
  }
);

it('rejects malformed and duplicated query parameters before reaching the room', async () => {
  for (const query of [
    'sinceSeq=-1',
    'sinceSeq=abc',
    'format=xml',
    'format=csv&sinceSeq=1',
    'format=csv&format=json',
  ])
    expect((await GET(new Request(`${url}?${query}`), params)).status).toBe(
      400
    );
  expect(mocks.session).not.toHaveBeenCalled();
});

it('blocks cross-origin and oversized mutations before dispatch', async () => {
  const buzz = { action: 'buzz', tileId };
  const post = (input: unknown, origin = 'https://meet.test') =>
    POST(
      new Request(url, {
        method: 'POST',
        headers: { origin },
        body: JSON.stringify(input),
      }),
      params
    );
  expect((await post(buzz, 'https://foreign.test')).status).toBe(403);
  expect(mocks.access).not.toHaveBeenCalled();
  expect((await post({ ...buzz, userId: 'spoofed' })).status).toBe(400);
  expect((await post({ ...buzz, padding: 'x'.repeat(64 * 1024) })).status).toBe(
    400
  );
  expect(mocks.action).not.toHaveBeenCalled();
  mocks.action.mockResolvedValue({ ok: true, seq: 3 });
  const response = await post(buzz);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, seq: 3 });
  expect(mocks.action.mock.calls[0]?.[1]).toEqual(buzz);
});
