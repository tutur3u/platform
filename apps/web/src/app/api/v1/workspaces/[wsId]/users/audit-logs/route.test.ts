import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPermissionsMock = vi.fn();
const listAuditLogEventsForRangeMock = vi.fn();

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
}));

vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/users/database/audit-log-data',
  () => ({
    listAuditLogEventsForRange: (
      ...args: Parameters<typeof listAuditLogEventsForRangeMock>
    ) => listAuditLogEventsForRangeMock(...args),
  })
);

import { GET } from './route';

describe('workspace user audit logs route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPermissionsMock.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'manage_workspace_audit_logs',
    });
    listAuditLogEventsForRangeMock.mockResolvedValue({
      count: 1,
      data: [
        {
          auditRecordId: 10,
          eventKind: 'archived',
          summary: 'Archived Alice',
          changedFields: ['archived'],
          fieldChanges: [],
          before: { archived: 'false' },
          after: { archived: 'true' },
          affectedUser: {
            id: 'user-1',
            name: 'Alice',
            email: 'alice@example.com',
          },
          actor: {
            authUid: 'actor-1',
            workspaceUserId: 'workspace-actor-1',
            id: 'actor-1',
            name: 'Bob',
            email: 'bob@example.com',
          },
          occurredAt: '2026-03-10T10:00:00.000Z',
          source: 'backfilled',
        },
      ],
    });
  });

  it('rejects callers without audit permission', async () => {
    getPermissionsMock.mockResolvedValue({
      containsPermission: () => false,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/users/audit-logs?start=2026-03-01T00:00:00.000Z&end=2026-04-01T00:00:00.000Z'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(403);
  });

  it('returns normalized audit events for export and pagination consumers', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/users/audit-logs?start=2026-03-01T00:00:00.000Z&end=2026-04-01T00:00:00.000Z&eventKind=archived&source=backfilled&affectedUserQuery=alice&actorQuery=bob&offset=0&limit=50'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

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
    expect(listAuditLogEventsForRangeMock).toHaveBeenCalledWith({
      wsId: 'ws-1',
      start: '2026-03-01T00:00:00.000Z',
      end: '2026-04-01T00:00:00.000Z',
      eventKind: 'archived',
      source: 'backfilled',
      affectedUserQuery: 'alice',
      actorQuery: 'bob',
      offset: 0,
      limit: 50,
    });
  });
});
