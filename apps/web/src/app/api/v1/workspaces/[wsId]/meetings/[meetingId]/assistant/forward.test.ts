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
const normalize = vi.fn(async () => WS_ID);

vi.mock('next/server', () => ({ NextResponse: { json: Response.json } }));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: async () => ({
    ok: true,
    supabase: { from: () => meetingQuery },
    user: { email: 'member@example.test', id: USER_ID },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: normalize,
  WorkspaceAuthError: class WorkspaceAuthError extends Error {},
  WorkspaceNotFoundError: class WorkspaceNotFoundError extends Error {},
  WorkspaceResolutionError: class WorkspaceResolutionError extends Error {},
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
  normalize.mockReset();
  normalize.mockResolvedValue(WS_ID);
  meetingQuery.maybeSingle.mockResolvedValue({
    data: { id: MEETING_ID },
    error: null,
  });
});

it('maps workspace resolution failures without forwarding to Meet', async () => {
  const { WorkspaceNotFoundError } = await import(
    '@tuturuuu/utils/workspace-helper'
  );
  normalize.mockRejectedValueOnce(new WorkspaceNotFoundError());
  const fetchMeet = vi.fn();
  globalThis.fetch = fetchMeet as unknown as typeof fetch;

  expect((await forward('assistant', 'POST')).status).toBe(404);
  expect(sign).not.toHaveBeenCalled();
  expect(fetchMeet).not.toHaveBeenCalled();
});

async function forward(
  action: 'assistant' | 'assistant/review',
  method: 'GET' | 'POST',
  suffix = '',
  headers?: HeadersInit
) {
  const { forwardMeetAssistant } = await import('./forward');
  return forwardMeetAssistant(
    new Request(
      `http://localhost/api/v1/workspaces/${WS_ID}/meetings/${MEETING_ID}/${action}${suffix}`,
      { method, headers, ...(method === 'POST' ? { body: '{}' } : {}) }
    ),
    { meetingId: MEETING_ID, wsId: WS_ID },
    action
  );
}

it('rejects cross-origin review decisions before minting a session', async () => {
  const fetchMeet = vi.fn();
  globalThis.fetch = fetchMeet as unknown as typeof fetch;

  expect(
    (
      await forward('assistant/review', 'POST', '', {
        Origin: 'https://elsewhere.test',
      })
    ).status
  ).toBe(403);
  expect(sign).not.toHaveBeenCalled();
  expect(fetchMeet).not.toHaveBeenCalled();
});

it('forwards a review only to the requested meeting and preserves private cache headers', async () => {
  const fetchMeet = vi.fn().mockResolvedValue(Response.json({ revision: 3 }));
  globalThis.fetch = fetchMeet as unknown as typeof fetch;

  const response = await forward(
    'assistant/review',
    'GET',
    '?messageId=room-message%3F1'
  );

  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ revision: 3 });
  const [endpoint, options] = fetchMeet.mock.calls[0]!;
  expect(new URL(endpoint).pathname).toBe(
    `/api/meet-call/${MEETING_ID}/assistant/review`
  );
  expect(new URL(endpoint).searchParams.get('messageId')).toBe(
    'room-message?1'
  );
  expect(options.headers.Authorization).toBe('Bearer scoped-meet-session');
  expect(sign).toHaveBeenCalledWith({
    email: 'member@example.test',
    expiresInSeconds: 180,
    targetApp: 'meet',
    userId: USER_ID,
  });
});

it('does not forward an action for a meeting outside the workspace', async () => {
  meetingQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
  const fetchMeet = vi.fn();
  globalThis.fetch = fetchMeet as unknown as typeof fetch;

  expect((await forward('assistant', 'POST')).status).toBe(404);
  expect(sign).not.toHaveBeenCalled();
  expect(fetchMeet).not.toHaveBeenCalled();
});

it('preserves an upstream approval denial without exposing the session', async () => {
  const fetchMeet = vi
    .fn()
    .mockResolvedValue(
      Response.json({ error: 'Review changed' }, { status: 409 })
    );
  globalThis.fetch = fetchMeet as unknown as typeof fetch;

  const response = await forward('assistant/review', 'POST');

  expect(response.status).toBe(409);
  expect(response.headers.get('Authorization')).toBeNull();
  expect(await response.json()).toEqual({ error: 'Review changed' });
});
