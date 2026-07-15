import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getPermissions: vi.fn(),
  listAuditLogEventsForRange: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: mocks.connection,
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getPermissions,
}));

vi.mock('@tuturuuu/users-core/database/audit-log-data', () => ({
  listAuditLogEventsForRange: mocks.listAuditLogEventsForRange,
}));

import { GET } from './route';

describe('Contacts-owned workspace user audit logs route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'manage_workspace_audit_logs',
    });
    mocks.listAuditLogEventsForRange.mockResolvedValue({
      count: 1,
      data: [
        {
          auditRecordId: 10,
          eventKind: 'archived',
          source: 'backfilled',
        },
      ],
    });
  });

  function createRequest() {
    return new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/ws-1/users/audit-logs?start=2026-03-01T00:00:00.000Z&end=2026-04-01T00:00:00.000Z&eventKind=archived&source=backfilled&affectedUserQuery=alice&actorQuery=bob&offset=0&limit=50'
    );
  }

  it('rejects callers without audit permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
    });

    const request = createRequest();
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.getPermissions).toHaveBeenCalledWith('ws-1', request);
  });

  it('returns audit events for export and pagination consumers', async () => {
    const request = createRequest();
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      count: 1,
      data: [
        expect.objectContaining({
          auditRecordId: 10,
          eventKind: 'archived',
          source: 'backfilled',
        }),
      ],
    });
    expect(mocks.listAuditLogEventsForRange).toHaveBeenCalledWith({
      wsId: 'ws-1',
      start: '2026-03-01T00:00:00.000Z',
      end: '2026-04-01T00:00:00.000Z',
      eventKind: 'archived',
      source: 'backfilled',
      affectedUserQuery: 'alice',
      actorQuery: 'bob',
      offset: 0,
      limit: 50,
      canViewPrivateInfo: false,
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith('ws-1', request);
  });

  it('passes private-info permission to audit enrichment', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'manage_workspace_audit_logs' ||
        permission === 'view_users_private_info',
    });

    const response = await GET(createRequest(), {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.listAuditLogEventsForRange).toHaveBeenCalledWith(
      expect.objectContaining({ canViewPrivateInfo: true })
    );
  });
});
