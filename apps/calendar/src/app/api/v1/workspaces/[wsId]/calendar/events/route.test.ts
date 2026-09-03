import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createProviderEvent: vi.fn(),
  decryptEvents: vi.fn(),
  deduplicateEvents: vi.fn(),
  encryptEvent: vi.fn(),
  getSyncPreferences: vi.fn(),
  getWorkspaceKey: vi.fn(),
  membership: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuth: vi.fn(),
  resolveOutboundSource: vi.fn(),
  resolveSource: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.resolveAuth,
}));
vi.mock('@/lib/calendar/event-deduplication', () => ({
  deduplicateCalendarEvents: mocks.deduplicateEvents,
}));
vi.mock('@/lib/calendar/provider-writes', () => ({
  createProviderEvent: mocks.createProviderEvent,
}));
vi.mock('@/lib/calendar/source-resolver', () => ({
  resolveCalendarSource: mocks.resolveSource,
}));
vi.mock('@/lib/calendar/sync-preferences', () => ({
  getCalendarSyncPreferences: mocks.getSyncPreferences,
  resolveOutboundSyncSource: mocks.resolveOutboundSource,
}));
vi.mock('@/lib/workspace-encryption', () => ({
  decryptEventsFromStorage: mocks.decryptEvents,
  encryptEventForStorage: mocks.encryptEvent,
  getWorkspaceKey: mocks.getWorkspaceKey,
}));

import { GET, POST } from './route';

const WS_ID = '00000000-0000-4000-8000-000000008611';
const USER_ID = '00000000-0000-4000-8000-000000008601';

function params(wsId = WS_ID) {
  return { params: Promise.resolve({ wsId }) };
}

function request(method: string, body?: unknown) {
  return new Request(
    `https://calendar.test/api/v1/workspaces/${WS_ID}/calendar/events?start_at=2026-08-10T00%3A00%3A00.000Z&end_at=2026-08-11T00%3A00%3A00.000Z`,
    {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers:
        body === undefined ? undefined : { 'content-type': 'application/json' },
    }
  );
}

function getQueryResult(data: unknown[] = []) {
  const query: any = {
    eq: vi.fn(() => query),
    gt: vi.fn(() => query),
    lt: vi.fn(() => query),
    order: vi.fn(async () => ({ data, error: null })),
    select: vi.fn(() => query),
  };
  return query;
}

function insertQueryResult(data: unknown) {
  const single = vi.fn(async () => ({ data, error: null }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  return { insert, select, single };
}

describe('workspace calendar event collection authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuth.mockResolvedValue({
      ok: true,
      supabase: { rpc: vi.fn(async () => ({ data: true, error: null })) },
      user: { id: USER_ID },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(WS_ID);
    mocks.membership.mockResolvedValue({ ok: true });
    mocks.deduplicateEvents.mockImplementation((events) => events);
    mocks.decryptEvents.mockImplementation(async (events) => events);
    mocks.resolveSource.mockResolvedValue({
      provider: 'tuturuuu',
      workspaceCalendarId: null,
    });
    mocks.getSyncPreferences.mockResolvedValue({ settingsAvailable: false });
    mocks.resolveOutboundSource.mockResolvedValue(null);
    mocks.getWorkspaceKey.mockResolvedValue(null);
    mocks.encryptEvent.mockImplementation(async (_wsId, event) => ({
      ...event,
      is_encrypted: false,
    }));
  });

  it.each([
    ['GET', GET],
    ['POST', POST],
  ])(
    'returns anonymous denial before admin access for %s',
    async (method, handler) => {
      mocks.resolveAuth.mockResolvedValue({
        ok: false,
        response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
      });
      const req = request(
        method,
        method === 'POST' ? { title: 'Ignored' } : undefined
      );
      const jsonSpy = vi.spyOn(req, 'json');

      const response = await handler(req, params());

      expect(response.status).toBe(401);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
      expect(jsonSpy).not.toHaveBeenCalled();
    }
  );

  it('requires the Calendar app-session audience', async () => {
    mocks.resolveAuth.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    await GET(request('GET'), params());

    expect(mocks.resolveAuth).toHaveBeenCalledWith(expect.any(Request), {
      allowAppSessionAuth: { targetApp: 'calendar' },
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('denies a nonmember before permission and admin access', async () => {
    const rpc = vi.fn();
    mocks.resolveAuth.mockResolvedValue({
      ok: true,
      supabase: { rpc },
      user: { id: USER_ID },
    });
    mocks.membership.mockResolvedValue({ ok: false });

    const response = await GET(request('GET'), params());

    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', GET],
    ['POST', POST],
  ])(
    'denies a member without manage_calendar before downstream work for %s',
    async (method, handler) => {
      const rpc = vi.fn(async () => ({ data: false, error: null }));
      mocks.resolveAuth.mockResolvedValue({
        ok: true,
        supabase: { rpc },
        user: { id: USER_ID },
      });
      const req = request(
        method,
        method === 'POST' ? { title: 'Ignored' } : undefined
      );
      const jsonSpy = vi.spyOn(req, 'json');

      const response = await handler(req, params());

      expect(response.status).toBe(403);
      expect(rpc).toHaveBeenCalledWith('has_workspace_permission', {
        p_permission: 'manage_calendar',
        p_user_id: USER_ID,
        p_ws_id: WS_ID,
      });
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
      expect(jsonSpy).not.toHaveBeenCalled();
      expect(mocks.decryptEvents).not.toHaveBeenCalled();
      expect(mocks.createProviderEvent).not.toHaveBeenCalled();
    }
  );

  it('normalizes personal before membership and permission checks', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const query = getQueryResult([]);
    mocks.resolveAuth.mockResolvedValue({
      ok: true,
      supabase: { rpc },
      user: { id: USER_ID },
    });
    mocks.createAdminClient.mockResolvedValue({ from: vi.fn(() => query) });

    const response = await GET(request('GET'), params('personal'));

    expect(response.status).toBe(200);
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      expect.anything()
    );
    expect(mocks.membership).toHaveBeenCalledWith(
      expect.objectContaining({ wsId: WS_ID, userId: USER_ID })
    );
  });

  it('preserves authorized GET response data', async () => {
    const events = [{ id: 'event-1', title: 'Planning' }];
    const query = getQueryResult(events);
    mocks.createAdminClient.mockResolvedValue({ from: vi.fn(() => query) });

    const response = await GET(request('GET'), params());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 1, data: events });
  });

  it('preserves authorized POST response and writes only after authorization', async () => {
    const stored = { id: 'event-1', title: 'Planning' };
    const query = insertQueryResult(stored);
    const from = vi.fn(() => query);
    mocks.createAdminClient.mockResolvedValue({ from });

    const response = await POST(
      request('POST', {
        title: 'Planning',
        start_at: '2026-08-10T09:00:00.000Z',
        end_at: '2026-08-10T10:00:00.000Z',
      }),
      params()
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(
      expect.objectContaining({ id: 'event-1', title: 'Planning' })
    );
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({ ws_id: WS_ID, title: 'Planning' })
    );
  });
});
