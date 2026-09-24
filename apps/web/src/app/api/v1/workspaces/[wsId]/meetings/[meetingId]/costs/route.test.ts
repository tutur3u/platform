import { verifyMeetRealtimeToken } from '@tuturuuu/realtime/meet/token';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const WS_ID = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const MEETING_ID = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const HOST_ID = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const MEMBER_ID = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
const SECRET = 'test-meet-cost-secret';

let actor = HOST_ID;
let membership = { ok: true };
const originalFetch = globalThis.fetch;
const meetingQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};
meetingQuery.select.mockReturnValue(meetingQuery);
meetingQuery.eq.mockReturnValue(meetingQuery);

vi.mock('next/server', () => ({
  NextResponse: { json: Response.json },
  connection: async () => undefined,
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: async () => ({
    ok: true,
    supabase: { from: () => meetingQuery },
    user: { id: actor },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => WS_ID,
  verifyWorkspaceMembershipType: async () => membership,
}));

beforeEach(() => {
  actor = HOST_ID;
  membership = { ok: true };
  process.env.MEET_REALTIME_TOKEN_SECRET = SECRET;
  meetingQuery.maybeSingle.mockResolvedValue({
    data: { creator_id: HOST_ID, id: MEETING_ID, ws_id: WS_ID },
    error: null,
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function readCosts() {
  const { GET } = await import('./route');
  return GET(
    new Request(
      `http://localhost/api/v1/workspaces/${WS_ID}/meetings/${MEETING_ID}/costs`
    ),
    { params: Promise.resolve({ meetingId: MEETING_ID, wsId: WS_ID }) }
  );
}

it('returns the host estimate without exposing its service token', async () => {
  const fetchRoom = vi.fn().mockResolvedValue(
    Response.json({
      cloudflare: { sfuEgressUsd: 0.001 },
      miraCostUsd: 0,
    })
  );
  globalThis.fetch = fetchRoom as unknown as typeof fetch;

  const response = await readCosts();

  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect((await response.json()).cloudflare.sfuEgressUsd).toBe(0.001);
  const [endpoint, options] = fetchRoom.mock.calls[0]!;
  expect(new URL(endpoint).pathname).toBe('/room-service');
  expect(JSON.parse(options.body)).toEqual({ action: 'costs' });
  const payload = verifyMeetRealtimeToken(
    options.headers.Authorization.replace('Bearer ', ''),
    SECRET
  );
  expect(payload?.scopes).toContain('meet:server');
  expect(payload?.role).toBe('host');
});

it('rejects a non-host before calling the room service', async () => {
  actor = MEMBER_ID;
  const fetchRoom = vi.fn();
  globalThis.fetch = fetchRoom as unknown as typeof fetch;

  const response = await readCosts();

  expect(response.status).toBe(403);
  expect(fetchRoom).not.toHaveBeenCalled();
});
