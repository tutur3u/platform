import { beforeEach, describe, expect, it, vi } from 'vitest';

const WS_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createAdminClient: vi.fn(),
  serverLoggerError: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

function permissionsWith(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

function createThenableQuery<TResult>(result: TResult) {
  const query = Promise.resolve(result) as Promise<TResult> & {
    eq: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    lte: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  };

  query.eq = vi.fn(() => query);
  query.gte = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.lte = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.range = vi.fn(() => query);
  query.select = vi.fn(() => query);

  return query;
}

function createAuditLogClient() {
  const auditQuery = createThenableQuery({
    count: 1,
    data: [
      {
        actor_auth_uid: 'auth-user-1',
        actor_workspace_user_id: ACTOR_ID,
        after: { name: 'After' },
        before: { name: 'Before' },
        changed_fields: ['name'],
        entity_id: 'entity-1',
        entity_kind: 'product',
        entity_label: 'Coffee',
        event_kind: 'updated',
        id: 'audit-1',
        occurred_at: '2026-06-15T00:00:00.000Z',
        source: 'api',
        summary: 'Updated product Coffee',
      },
    ],
    error: null,
  });
  const actorQuery = createThenableQuery({
    data: [
      {
        display_name: 'Ada',
        full_name: 'Ada Lovelace',
        id: ACTOR_ID,
      },
    ],
    error: null,
  });
  const privateFrom = vi.fn((table: string) => {
    if (table === 'inventory_audit_logs') return auditQuery;
    throw new Error(`Unexpected private table: ${table}`);
  });
  const from = vi.fn((table: string) => {
    if (table === 'workspace_users') return actorQuery;
    throw new Error(`Unexpected public table: ${table}`);
  });
  const schema = vi.fn((name: string) => {
    if (name !== 'private') throw new Error(`Unexpected schema: ${name}`);
    return { from: privateFrom };
  });

  return {
    auditQuery,
    client: { from, schema },
    privateFrom,
  };
}

describe('inventory audit logs route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects broad inventory roles without querying audit logs', async () => {
    const auditClient = createAuditLogClient();
    mocks.createAdminClient.mockResolvedValue(auditClient.client);
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['manage_inventory_catalog']),
        wsId: WS_ID,
      },
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        `https://app.example.com/api/v1/workspaces/${WS_ID}/inventory/audit-logs`
      ),
      {
        params: Promise.resolve({
          wsId: WS_ID,
        }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
    expect(auditClient.privateFrom).not.toHaveBeenCalledWith(
      'inventory_audit_logs'
    );
  });

  it('allows dedicated inventory audit-log readers', async () => {
    const auditClient = createAuditLogClient();
    mocks.createAdminClient.mockResolvedValue(auditClient.client);
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['view_inventory_audit_logs']),
        wsId: WS_ID,
      },
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        `https://app.example.com/api/v1/workspaces/${WS_ID}/inventory/audit-logs`
      ),
      {
        params: Promise.resolve({
          wsId: WS_ID,
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(auditClient.privateFrom).toHaveBeenCalledWith(
      'inventory_audit_logs'
    );
    expect(auditClient.auditQuery.eq).toHaveBeenCalledWith('ws_id', WS_ID);
    await expect(response.json()).resolves.toEqual({
      count: 1,
      data: [
        expect.objectContaining({
          actor: {
            authUid: 'auth-user-1',
            displayName: 'Ada Lovelace',
            workspaceUserId: ACTOR_ID,
          },
          auditRecordId: 'audit-1',
          entityId: 'entity-1',
          summary: 'Updated product Coffee',
        }),
      ],
    });
  });
});
