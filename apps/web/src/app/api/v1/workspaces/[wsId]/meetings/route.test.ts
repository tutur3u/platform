import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  adminRpc: vi.fn(),
  auth: vi.fn(),
  encryptEvent: vi.fn(),
  from: vi.fn(),
  getWorkspaceKey: vi.fn(),
  identity: vi.fn(),
  insert: vi.fn(),
  membership: vi.fn(),
  normalize: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: { admin: { getUserById: mocks.identity } },
    from: mocks.adminFrom,
    rpc: mocks.adminRpc,
  }),
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  WorkspaceNotFoundError: class WorkspaceNotFoundError extends Error {},
  normalizeWorkspaceId: mocks.normalize,
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('@/lib/workspace-encryption', () => ({
  encryptEventForStorage: mocks.encryptEvent,
  getWorkspaceKey: mocks.getWorkspaceKey,
}));
vi.mock('@/lib/calendar-app-url', () => ({
  getCalendarAppOrigin: () => 'https://calendar.tuturuuu.com',
}));
vi.mock('@/lib/meet-app-url', () => ({
  getMeetAppOrigin: () => 'https://meet.tuturuuu.com',
}));

import { POST } from './route';

const params = { params: Promise.resolve({ wsId: 'personal' }) };

function request(body?: Record<string, unknown>) {
  return new NextRequest(
    'https://example.test/api/v1/workspaces/personal/meetings',
    {
      method: 'POST',
      body: JSON.stringify(
        body ?? {
          name: 'Test',
          time: '2026-09-06T10:00:00Z',
          creator_id: 'forged',
        }
      ),
    }
  );
}

function authenticatedContext(...args: [email?: string]) {
  const email = args.length === 0 ? 'host@tuturuuu.com' : args[0];
  return {
    ok: true,
    user: {
      id: 'actor',
      email,
      user_metadata: { email: 'spoof@tuturuuu.com' },
    },
    supabase: { from: mocks.from, rpc: mocks.rpc },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue({
    data: {
      user: { email: 'host@tuturuuu.com', email_confirmed_at: '2026-01-01' },
    },
    error: null,
  });
  mocks.normalize.mockResolvedValue('workspace-id');
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.getWorkspaceKey.mockResolvedValue(null);
  mocks.encryptEvent.mockImplementation(async (_wsId, fields) => ({
    ...fields,
    is_encrypted: false,
  }));
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockReturnValue({
    select: () => ({
      single: async () => ({ data: { id: 'meeting-id' }, error: null }),
    }),
  });
  mocks.adminRpc.mockResolvedValue({
    data: {
      meeting: { id: 'meeting-id' },
      calendar_event: {
        id: 'calendar-event-id',
        start_at: '2026-09-06T10:00:00Z',
        end_at: '2026-09-06T11:00:00Z',
      },
    },
    error: null,
  });
});

describe('meeting creation authorization', () => {
  it.each(['external@gmail.com', 'host@tuturuuu.com.attacker.test', undefined])(
    'denies %s before accessing database',
    async (email) => {
      mocks.auth.mockResolvedValue(authenticatedContext(email));
      const response = await POST(request(), params);
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('MEET_CREATION_RESTRICTED');
      expect(mocks.from).not.toHaveBeenCalled();
    }
  );

  it('allows an authenticated company account and stamps its actor', async () => {
    mocks.auth.mockResolvedValue(authenticatedContext('Host@TUTURUUU.COM'));
    expect((await POST(request(), params)).status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ creator_id: 'actor', ws_id: 'workspace-id' })
    );
  });

  it('still requires workspace membership for company accounts', async () => {
    mocks.auth.mockResolvedValue(authenticatedContext());
    mocks.membership.mockResolvedValue({ ok: false });
    expect((await POST(request(), params)).status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('preserves unauthenticated rejection', async () => {
    mocks.auth.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });
    expect((await POST(request(), params)).status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe('meeting creation input validation', () => {
  it.each([
    '{',
    'null',
    '[]',
    '{"name":123,"time":"bad"}',
    '{"name":"Meeting","time":"bad"}',
  ])('rejects invalid body %s without inserting', async (body) => {
    mocks.auth.mockResolvedValue(authenticatedContext());
    const response = await POST(
      new NextRequest('https://example.test', { method: 'POST', body }),
      params
    );
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe('authoritative creator identity', () => {
  it.each([
    { email: 'external@example.test', email_confirmed_at: '2026-01-01' },
    { email: 'host@tuturuuu.com', email_confirmed_at: null },
  ])('rejects a forged or unconfirmed company session claim', async (user) => {
    mocks.auth.mockResolvedValue(authenticatedContext());
    mocks.identity.mockResolvedValue({ data: { user }, error: null });
    expect((await POST(request(), params)).status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('fails closed when current identity cannot be verified', async () => {
    mocks.auth.mockResolvedValue(authenticatedContext());
    mocks.identity.mockResolvedValue({
      data: { user: null },
      error: new Error('Unavailable'),
    });
    expect((await POST(request(), params)).status).toBe(503);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe('Calendar scheduling', () => {
  it('creates a linked Calendar event for a scheduled meeting', async () => {
    mocks.auth.mockResolvedValue(authenticatedContext());

    const response = await POST(
      request({
        name: 'Design review',
        time: '2026-09-06T10:00:00Z',
        schedule: { endTime: '2026-09-06T11:00:00Z' },
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('has_workspace_permission', {
      p_ws_id: 'workspace-id',
      p_user_id: 'actor',
      p_permission: 'manage_calendar',
    });
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'create_scheduled_workspace_meeting',
      expect.objectContaining({
        p_start_at: '2026-09-06T10:00:00Z',
        p_end_at: '2026-09-06T11:00:00Z',
        p_meeting_url: expect.stringContaining(
          'https://meet.tuturuuu.com/personal/meetings/'
        ),
      })
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        calendarEvent: expect.objectContaining({
          id: 'calendar-event-id',
          url: expect.stringContaining('eventId=calendar-event-id'),
        }),
      })
    );
  });

  it('requires Calendar permission before inserting either record', async () => {
    mocks.auth.mockResolvedValue(authenticatedContext());
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const response = await POST(
      request({
        name: 'Design review',
        time: '2026-09-06T10:00:00Z',
        schedule: { endTime: '2026-09-06T11:00:00Z' },
      }),
      params
    );

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('CALENDAR_PERMISSION_REQUIRED');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('rejects a schedule whose end is not after its start', async () => {
    mocks.auth.mockResolvedValue(authenticatedContext());

    const response = await POST(
      request({
        name: 'Design review',
        time: '2026-09-06T10:00:00Z',
        schedule: { endTime: '2026-09-06T09:00:00Z' },
      }),
      params
    );

    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('returns 500 without a partial meeting when the atomic RPC fails', async () => {
    mocks.auth.mockResolvedValue(authenticatedContext());
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: new Error('calendar insert failed'),
    });

    const response = await POST(
      request({
        name: 'Design review',
        time: '2026-09-06T10:00:00Z',
        schedule: { endTime: '2026-09-06T11:00:00Z' },
      }),
      params
    );

    expect(response.status).toBe(500);
    expect(mocks.adminRpc).toHaveBeenCalledOnce();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
