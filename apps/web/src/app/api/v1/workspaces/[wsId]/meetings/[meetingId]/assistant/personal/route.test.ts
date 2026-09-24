import { beforeEach, expect, it, vi } from 'vitest';

const WS_ID = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const MEETING_ID = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const USER_ID = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
const originalFetch = globalThis.fetch;
const meetingQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};
meetingQuery.select.mockReturnValue(meetingQuery);
meetingQuery.eq.mockReturnValue(meetingQuery);
const sign = vi.fn(() => ({ token: 'scoped-meet-session' }));

vi.mock('next/server', () => ({ NextResponse: { json: Response.json } }));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: async () => ({
    ok: true,
    supabase: { from: () => meetingQuery },
    user: { email: 'member@example.test', id: USER_ID },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => WS_ID,
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  createAppSessionToken: sign,
}));
vi.mock('@/lib/meet-app-url', () => ({
  getMeetAppOrigin: () => 'https://meet.example.test',
}));

beforeEach(() => {
  globalThis.fetch = originalFetch;
  sign.mockClear();
  meetingQuery.maybeSingle.mockResolvedValue({
    data: { id: MEETING_ID },
    error: null,
  });
});

async function send(body: string, headers?: HeadersInit) {
  const { POST } = await import('./route');
  return POST(
    new Request(
      `http://localhost/api/v1/workspaces/${WS_ID}/meetings/${MEETING_ID}/assistant/personal`,
      { method: 'POST', body, headers }
    ),
    { params: Promise.resolve({ meetingId: MEETING_ID, wsId: WS_ID }) }
  );
}

it('rejects a cross-origin browser post before minting a session', async () => {
  const fetchMeet = vi.fn();
  globalThis.fetch = fetchMeet as unknown as typeof fetch;

  const response = await send('{}', { Origin: 'https://other.example.test' });

  expect(response.status).toBe(403);
  expect(sign).not.toHaveBeenCalled();
  expect(fetchMeet).not.toHaveBeenCalled();
});

it('forwards private chat with a short-lived Meet-scoped token', async () => {
  const fetchMeet = vi
    .fn()
    .mockResolvedValue(Response.json({ text: 'Private' }));
  globalThis.fetch = fetchMeet as unknown as typeof fetch;

  const response = await send('{"question":"Hello"}');

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: 'Private' });
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(sign).toHaveBeenCalledWith({
    email: 'member@example.test',
    expiresInSeconds: 180,
    targetApp: 'meet',
    userId: USER_ID,
  });
  const [endpoint, options] = fetchMeet.mock.calls[0]!;
  expect(new URL(endpoint).pathname).toBe(
    `/api/meet-call/${MEETING_ID}/assistant/personal`
  );
  expect(options.headers).toMatchObject({
    Authorization: 'Bearer scoped-meet-session',
    Origin: 'https://meet.example.test',
  });
});

it('does not mint a Meet session for a missing meeting', async () => {
  meetingQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
  const fetchMeet = vi.fn();
  globalThis.fetch = fetchMeet as unknown as typeof fetch;

  expect((await send('{}')).status).toBe(404);
  expect(sign).not.toHaveBeenCalled();
  expect(fetchMeet).not.toHaveBeenCalled();
});

it('preserves a private chat denial without exposing its credential', async () => {
  const fetchMeet = vi
    .fn()
    .mockResolvedValue(
      Response.json({ error: 'AI quota is unavailable' }, { status: 403 })
    );
  globalThis.fetch = fetchMeet as unknown as typeof fetch;

  const response = await send('{"question":"Hello"}');

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: 'AI quota is unavailable' });
  expect(response.headers.get('Authorization')).toBeNull();
});
