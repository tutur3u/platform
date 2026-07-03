import { canMeetRealtimePublish } from '@tuturuuu/realtime/meet';
import { verifyMeetRealtimeToken } from '@tuturuuu/realtime/meet/token';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MEETING_ID = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const WORKSPACE_ID = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const CREATOR_ID = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const MEMBER_ID = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
const TOKEN_SECRET = 'test-meet-realtime-token-secret';

type RouteMocks = ReturnType<typeof createRouteMocks>;

let mocks: RouteMocks;

function createRouteMocks() {
  return {
    meetingResult: {
      data: {
        creator_id: CREATOR_ID,
        id: MEETING_ID,
        ws_id: WORKSPACE_ID,
      },
      error: null,
    },
    normalizeWorkspaceId: vi.fn(),
    resolveSessionAuthContext: vi.fn(),
    serverLogger: {
      error: vi.fn(),
    },
    verifyWorkspaceMembershipType: vi.fn(),
  };
}

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (
    ...args: Parameters<typeof mocks.resolveSessionAuthContext>
  ) => mocks.resolveSessionAuthContext(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

function createMeetingQuery() {
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => mocks.meetingResult);
  return query;
}

function createSupabaseClient() {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'workspace_meetings') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return createMeetingQuery();
    }),
  };
}

function createRequest(body: unknown) {
  return new Request(
    `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/meetings/${MEETING_ID}/realtime-token`,
    {
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

async function requestToken(body: unknown) {
  const { POST } = await import(
    '@/legacy-api-routes/v1/workspaces/[wsId]/meetings/[meetingId]/realtime-token/route'
  );

  return POST(createRequest(body), {
    params: Promise.resolve({
      meetingId: MEETING_ID,
      wsId: WORKSPACE_ID,
    }),
  });
}

describe('Meet realtime token route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MEET_REALTIME_TOKEN_SECRET = TOKEN_SECRET;
    delete process.env.MEET_REALTIME_URL;
    delete process.env.NEXT_PUBLIC_MEET_REALTIME_URL;
    mocks = createRouteMocks();
    const supabase = createSupabaseClient();

    mocks.normalizeWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase,
      user: { email: 'member@example.com', id: MEMBER_ID },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('does not mint publish-capable tokens from non-creator requested speaker call controls', async () => {
    const response = await requestToken({ mode: 'call', role: 'speaker' });

    expect(response.status).toBe(200);
    const body = await response.json();
    const payload = verifyMeetRealtimeToken(body.token, TOKEN_SECRET);

    expect(body).toMatchObject({
      mode: 'webinar',
      role: 'viewer',
      roomId: `${WORKSPACE_ID}:${MEETING_ID}`,
    });
    expect(payload).toMatchObject({
      mode: 'webinar',
      role: 'viewer',
      roomId: `${WORKSPACE_ID}:${MEETING_ID}`,
      userId: MEMBER_ID,
      wsId: WORKSPACE_ID,
    });
    expect(payload?.scopes).not.toContain('sfu:publish');
    expect(payload && canMeetRealtimePublish(payload, 'audio')).toBe(false);
    expect(mocks.resolveSessionAuthContext).toHaveBeenCalledWith(
      expect.any(Request),
      {
        allowAppSessionAuth: { targetApp: 'meet' },
      }
    );
  });

  it('defaults non-creators to viewer tokens even when no role is requested', async () => {
    const response = await requestToken({});

    expect(response.status).toBe(200);
    const body = await response.json();
    const payload = verifyMeetRealtimeToken(body.token, TOKEN_SECRET);

    expect(payload).toMatchObject({
      mode: 'webinar',
      role: 'viewer',
      userId: MEMBER_ID,
    });
    expect(payload?.scopes).not.toContain('sfu:publish');
  });

  it('still lets the meeting creator mint host stream-control tokens', async () => {
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: createSupabaseClient(),
      user: { email: 'host@example.com', id: CREATOR_ID },
    });

    const response = await requestToken({ mode: 'stream', role: 'host' });

    expect(response.status).toBe(200);
    const body = await response.json();
    const payload = verifyMeetRealtimeToken(body.token, TOKEN_SECRET);

    expect(payload).toMatchObject({
      mode: 'stream',
      role: 'host',
      userId: CREATOR_ID,
    });
    expect(payload?.scopes).toEqual(
      expect.arrayContaining(['stream:control', 'sfu:publish'])
    );
    expect(payload && canMeetRealtimePublish(payload, 'video')).toBe(true);
  });

  it('returns the configured public Meet realtime URL', async () => {
    process.env.MEET_REALTIME_URL = 'wss://internal.example/realtime';
    process.env.NEXT_PUBLIC_MEET_REALTIME_URL =
      'wss://meet.example.com/realtime';

    const response = await requestToken({ mode: 'call', role: 'viewer' });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.realtimeUrl).toBe('wss://meet.example.com/realtime');
  });
});
