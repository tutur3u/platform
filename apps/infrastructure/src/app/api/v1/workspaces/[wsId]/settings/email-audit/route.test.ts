import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  actor: vi.fn(),
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: mock.actor,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mock.createAdminClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mock.getPermissions,
}));

import { GET } from './route';

const actorUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'infra-actor@example.test',
};
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222';
const rows = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    subject: 'Synthetic audit subject',
    status: 'sent',
    provider: 'ses',
    template_type: 'synthetic',
    source_email: 'sender@example.test',
    created_at: '2026-10-08T00:00:00.000Z',
  },
];
const statsRows = [
  {
    failed_count: '2',
    rate_limited_count: '1',
    sent_count: '7',
    total_count: '10',
  },
];
const expectedStats = { failed: 2, rateLimited: 1, sent: 7, total: 10 };
const zeroStats = { failed: 0, rateLimited: 0, sent: 0, total: 0 };
const auditSelect =
  'id, subject, status, provider, template_type, source_email, created_at';

const query = {
  select: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
};
const admin = {
  from: vi.fn(),
  rpc: vi.fn(),
};

function permissions(allowed: boolean, wsId = ROOT_WORKSPACE_ID) {
  return {
    wsId,
    permissions: allowed ? ['view_infrastructure'] : [],
    containsPermission: (permission: string) =>
      allowed && permission === 'view_infrastructure',
  };
}

function request(wsId: string) {
  return new Request(
    `https://infrastructure.example.test/api/v1/workspaces/${encodeURIComponent(wsId)}/settings/email-audit`
  );
}

async function read(wsId = ROOT_WORKSPACE_ID) {
  const incoming = request(wsId);
  const response = await GET(incoming, {
    params: Promise.resolve({ wsId }),
  });
  return { incoming, response };
}

function expectNoGlobalReads() {
  expect(
    admin.from.mock.calls.filter(([table]) => table === 'email_audit')
  ).toHaveLength(0);
  expect(
    admin.rpc.mock.calls.filter(([name]) => name === 'get_email_stats')
  ).toHaveLength(0);
}

async function expectDenied(wsId: string, status: number, message: string) {
  const { response } = await read(wsId);
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ message });
  expectNoGlobalReads();
}

beforeEach(() => {
  vi.resetAllMocks();
  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockResolvedValue({ data: rows, count: 9, error: null });
  admin.from.mockReturnValue(query);
  admin.rpc.mockResolvedValue({ data: statsRows, error: null });
  mock.createAdminClient.mockResolvedValue(admin);
  mock.actor.mockResolvedValue({ user: actorUser, admin });
  mock.getPermissions.mockResolvedValue(permissions(true));
});

describe('global email audit ROOT request admission', () => {
  // These are boundary fixtures, not assertions that Auth or SQL was exercised.
  it.each(['creator', 'admin'])(
    'denies a nonROOT %s despite the generic permission shortcut',
    async (role) => {
      mock.getPermissions.mockResolvedValue({
        ...permissions(true, otherWorkspaceId),
        permissions: role === 'admin' ? ['admin'] : [],
      });
      await expectDenied(otherWorkspaceId, 403, 'Forbidden');
    }
  );

  it.each(['personal', 'root', ' internal '])(
    'does not broaden ROOT aliases to %j',
    async (wsId) => {
      await expectDenied(wsId, 403, 'Forbidden');
    }
  );

  it('requires a current verified actor even if generic permissions allow', async () => {
    mock.actor.mockResolvedValue(null);
    await expectDenied(ROOT_WORKSPACE_ID, 401, 'Unauthorized');
  });

  it('denies a ROOT actor without view_infrastructure', async () => {
    mock.getPermissions.mockResolvedValue(permissions(false));
    await expectDenied(ROOT_WORKSPACE_ID, 403, 'Forbidden');
  });

  it('fails closed on null authorization without attributing its cause', async () => {
    mock.getPermissions.mockResolvedValue(null);
    await expectDenied(ROOT_WORKSPACE_ID, 403, 'Forbidden');
  });

  it('returns a generic error when request actor verification throws', async () => {
    mock.actor.mockRejectedValue(new Error('synthetic actor failure'));
    await expectDenied(ROOT_WORKSPACE_ID, 500, 'Internal server error');
  });

  it('returns a generic error when authorization unexpectedly throws', async () => {
    mock.getPermissions.mockRejectedValue(
      new Error('synthetic permission failure')
    );
    await expectDenied(ROOT_WORKSPACE_ID, 500, 'Internal server error');
  });

  it.each([ROOT_WORKSPACE_ID, 'internal', 'INTERNAL'])(
    'allows a verified privileged ROOT actor via %s with canonical stats scope',
    async (wsId) => {
      const { incoming, response } = await read(wsId);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        count: 9,
        data: rows,
        stats: expectedStats,
      });
      expect(mock.actor).toHaveBeenCalledWith(incoming, 'infra');
      expect(mock.getPermissions).toHaveBeenCalledWith(
        expect.objectContaining({ user: actorUser, wsId: ROOT_WORKSPACE_ID })
      );
      expect(admin.rpc).toHaveBeenCalledWith('get_email_stats', {
        end_date: undefined,
        filter_ws_id: ROOT_WORKSPACE_ID,
        start_date: undefined,
      });
      expect(admin.from).toHaveBeenCalledWith('email_audit');
      expect(query.select).toHaveBeenCalledWith(auditSelect, {
        count: 'exact',
      });
      expect(query.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
      expect(query.limit).toHaveBeenCalledWith(25);
    }
  );

  it('preserves the audit read failure response', async () => {
    query.limit.mockResolvedValue({
      data: null,
      count: null,
      error: { message: 'synthetic audit failure' },
    });
    const { response } = await read();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Failed to load email audit rows',
    });
  });

  it('preserves successful audit rows when stats fail', async () => {
    admin.rpc.mockResolvedValue({
      data: null,
      error: { message: 'synthetic stats failure' },
    });
    const { response } = await read();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      count: 9,
      data: rows,
      stats: zeroStats,
    });
  });

  it('preserves empty audit and stats fallback values', async () => {
    query.limit.mockResolvedValue({ data: null, count: null, error: null });
    admin.rpc.mockResolvedValue({ data: null, error: null });
    const { response } = await read();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      count: 0,
      data: [],
      stats: zeroStats,
    });
  });
});
