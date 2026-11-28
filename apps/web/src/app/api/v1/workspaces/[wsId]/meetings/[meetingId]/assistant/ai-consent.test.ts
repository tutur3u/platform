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
const consent = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock('next/server', () => ({ NextResponse: { json: Response.json } }));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: async () => ({
    ok: true,
    supabase: { from: () => meetingQuery },
    user: { email: 'member@example.test', id: USER_ID },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: vi.fn(async () => WS_ID),
  WorkspaceAuthError: class WorkspaceAuthError extends Error {},
  WorkspaceNotFoundError: class WorkspaceNotFoundError extends Error {},
  WorkspaceResolutionError: class WorkspaceResolutionError extends Error {},
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  createAppSessionToken: sign,
}));
vi.mock('@tuturuuu/utils/ai-data-consent-store', () => ({
  AI_DATA_CONSENT_POLICY_VERSION: 'test',
  lookupAiDataConsent: consent.lookup,
}));
vi.mock('@/lib/meet-app-url', () => ({
  getMeetServiceOrigin: () => 'https://meet.example.test',
}));

const NATIVE = { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.native.jwt' };

beforeEach(() => {
  globalThis.fetch = originalFetch;
  sign.mockClear();
  consent.lookup.mockReset();
  meetingQuery.maybeSingle.mockResolvedValue({
    data: { id: MEETING_ID },
    error: null,
  });
});

function stubMeet() {
  const fetchMeet = vi.fn(async () => Response.json({ text: 'ok' }));
  globalThis.fetch = fetchMeet as unknown as typeof fetch;
  return fetchMeet;
}

async function personal(headers?: HeadersInit) {
  const { POST } = await import('./personal/route');
  return POST(
    new Request(
      `http://localhost/api/v1/workspaces/${WS_ID}/meetings/${MEETING_ID}/assistant/personal`,
      { method: 'POST', body: '{"question":"Hello"}', headers }
    ),
    { params: Promise.resolve({ meetingId: MEETING_ID, wsId: WS_ID }) }
  );
}

async function forward(
  action: 'assistant' | 'assistant/review',
  method: 'GET' | 'POST',
  headers?: HeadersInit
) {
  const { forwardMeetAssistant } = await import('./forward');
  return forwardMeetAssistant(
    new Request(
      `http://localhost/api/v1/workspaces/${WS_ID}/meetings/${MEETING_ID}/${action}`,
      { method, headers, ...(method === 'POST' ? { body: '{}' } : {}) }
    ),
    { meetingId: MEETING_ID, wsId: WS_ID },
    action
  );
}

it.each([
  ['personal chat', () => personal(NATIVE)],
  ['room assistant', () => forward('assistant', 'POST', NATIVE)],
  ['review decision', () => forward('assistant/review', 'POST', NATIVE)],
])(
  'refuses a native %s without consent before minting a Meet session',
  async (_label, send) => {
    consent.lookup.mockResolvedValue(false);
    const fetchMeet = stubMeet();

    const response = await send();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'ai_consent_required',
    });
    expect(consent.lookup).toHaveBeenCalledWith(USER_ID, undefined);
    expect(sign).not.toHaveBeenCalled();
    expect(fetchMeet).not.toHaveBeenCalled();
  }
);

it('forwards a consented native prompt with a consent-required Meet session', async () => {
  consent.lookup.mockResolvedValue(true);
  const fetchMeet = stubMeet();

  expect((await personal(NATIVE)).status).toBe(200);
  expect((await forward('assistant', 'POST', NATIVE)).status).toBe(200);
  expect(fetchMeet).toHaveBeenCalledTimes(2);
  for (const [payload] of sign.mock.calls as unknown as [
    Record<string, unknown>,
  ][]) {
    expect(payload).toMatchObject({
      aiConsentRequired: true,
      targetApp: 'meet',
      userId: USER_ID,
    });
  }
});

it('keeps browser sessions exempt and reading reviews unchecked', async () => {
  const fetchMeet = stubMeet();

  expect((await personal()).status).toBe(200);
  expect((await forward('assistant', 'POST')).status).toBe(200);
  expect((await forward('assistant/review', 'GET', NATIVE)).status).toBe(200);
  expect(consent.lookup).not.toHaveBeenCalled();
  expect(fetchMeet).toHaveBeenCalledTimes(3);
  expect(sign.mock.calls[0]).not.toHaveProperty('0.aiConsentRequired');
});
