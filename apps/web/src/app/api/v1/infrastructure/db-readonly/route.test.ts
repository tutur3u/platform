import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const builderCalls: Array<{ args: unknown[]; method: string }> = [];
  let queryResult: { data: unknown; error: { code?: string } | null } = {
    data: [{ id: 'ws-1', name: 'Tuturuuu' }],
    error: null,
  };
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {};
    for (const method of [
      'select',
      'eq',
      'neq',
      'lt',
      'lte',
      'gt',
      'gte',
      'is',
      'not',
      'order',
      'limit',
      'abortSignal',
    ]) {
      builder[method] = vi.fn((...args: unknown[]) => {
        builderCalls.push({ args, method });
        return builder;
      });
    }
    builder.then = (
      resolve: (value: {
        data: unknown;
        error: { code?: string } | null;
      }) => unknown
    ) => Promise.resolve(queryResult).then(resolve);
    return builder;
  };
  return {
    builderCalls,
    connection: vi.fn(),
    createAdminClient: vi.fn(),
    from: vi.fn(() => makeBuilder()),
    getPermissions: vi.fn(),
    getUserById: vi.fn(),
    resolveSessionAuthContext: vi.fn(),
    setQueryResult: (next: {
      data: unknown;
      error: { code?: string } | null;
    }) => {
      queryResult = next;
    },
  };
});

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
  connection: mocks.connection,
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.resolveSessionAuthContext,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { POST } from './route';

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request(
    'https://web.tutur3u.com/api/v1/infrastructure/db-readonly',
    {
      body: JSON.stringify(body),
      headers: {
        authorization: 'Bearer ttr_app_super_secret_token_value',
        'content-type': 'application/json',
        'x-ttr-request-id': 'req-db-readonly-001',
        ...headers,
      },
      method: 'POST',
    }
  );
}

describe('POST /api/v1/infrastructure/db-readonly', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.builderCalls.length = 0;
    mocks.setQueryResult({
      data: [{ id: 'ws-1', name: 'Tuturuuu' }],
      error: null,
    });
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      user: { email: 'ops@tuturuuu.com', id: 'root-staff-user-1' },
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (perm: string) => perm === 'manage_workspace_roles',
      membershipType: 'MEMBER',
    });
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          email: 'ops@tuturuuu.com',
          email_confirmed_at: '2026-01-01T00:00:00Z',
          id: 'root-staff-user-1',
          identities: [{ identity_data: {}, provider: 'email' }],
        },
      },
      error: null,
    });
    mocks.createAdminClient.mockResolvedValue({
      auth: { admin: { getUserById: mocks.getUserById } },
      from: mocks.from,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated (401), employee-creation-only role (403), and non-@tuturuuu.com callers (403)', async () => {
    mocks.resolveSessionAuthContext.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const unauth = await POST(
      makeRequest({ sql: 'SELECT id FROM workspaces' })
    );
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get('cache-control')).toBe('no-store');
    expect(mocks.from).not.toHaveBeenCalled();

    // Root member with manage_internal_accounts ONLY (not root admin) MUST be rejected with 403.
    mocks.getPermissions.mockResolvedValueOnce({
      containsPermission: (perm: string) => perm === 'manage_internal_accounts',
      membershipType: 'MEMBER',
    });
    const employeeCreator = await POST(
      makeRequest({ sql: 'SELECT id FROM workspaces' })
    );
    expect(employeeCreator.status).toBe(403);
    expect(employeeCreator.headers.get('cache-control')).toBe('no-store');
    expect(mocks.from).not.toHaveBeenCalled();

    // Non-@tuturuuu.com user MUST be rejected with 403 even with workspace role permission.
    mocks.resolveSessionAuthContext.mockResolvedValueOnce({
      ok: true,
      user: { email: 'contractor@example.com', id: 'ext-user-1' },
    });
    const nonStaff = await POST(
      makeRequest({ sql: 'SELECT id FROM workspaces' })
    );
    expect(nonStaff.status).toBe(403);
    expect(nonStaff.headers.get('cache-control')).toBe('no-store');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects comments, arithmetic LIMIT, DML, DDL, joins, forbidden schemas, unlisted tables, and LIMIT > 500', async () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    const rejectedQueries: Array<{ expectedStatus: number; sql: string }> = [
      { expectedStatus: 403, sql: 'SELECT id FROM workspaces -- comment' },
      { expectedStatus: 403, sql: 'SELECT /* comment */ id FROM workspaces' },
      { expectedStatus: 403, sql: 'SELECT id FROM workspaces LIMIT 1+999' },
      { expectedStatus: 403, sql: 'DELETE FROM tasks' },
      { expectedStatus: 403, sql: 'DROP TABLE workspaces' },
      {
        expectedStatus: 403,
        sql: 'WITH d AS (DELETE FROM tasks RETURNING *) SELECT * FROM d',
      },
      { expectedStatus: 403, sql: 'EXPLAIN ANALYZE SELECT id FROM workspaces' },
      { expectedStatus: 403, sql: 'SELECT * FROM auth.users' },
      { expectedStatus: 403, sql: 'SELECT * FROM vault.secrets' },
      { expectedStatus: 403, sql: 'SELECT * FROM private.keys' },
      { expectedStatus: 403, sql: 'SELECT * FROM devbox_runners' },
      { expectedStatus: 403, sql: 'SELECT * FROM users' },
      {
        expectedStatus: 403,
        sql: 'SELECT w.id FROM workspaces w JOIN users u ON u.id = w.id',
      },
      {
        expectedStatus: 403,
        sql: 'SELECT id FROM workspaces; SELECT id FROM tasks',
      },
      { expectedStatus: 400, sql: 'SELECT id FROM workspaces LIMIT 501' },
      { expectedStatus: 400, sql: 'SELECT id FROM workspaces LIMIT 9999' },
    ];

    for (const testCase of rejectedQueries) {
      const response = await POST(
        makeRequest({ env: 'staging', sql: testCase.sql })
      );
      expect(response.status, testCase.sql).toBe(testCase.expectedStatus);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }

    expect(mocks.from).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    const serializedWarnings = JSON.stringify(warnSpy.mock.calls);
    expect(serializedWarnings).not.toContain(
      'ttr_app_super_secret_token_value'
    );
  });

  it('rejects payload limit > 500 via Zod validation', async () => {
    const response = await POST(
      makeRequest({
        env: 'staging',
        limit: 600,
        sql: 'SELECT id FROM workspaces',
      })
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('executes allowlisted SELECT via PostgREST read-only builder with limit, abortSignal, no-store, and audit log', async () => {
    const infoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined);

    const response = await POST(
      makeRequest({
        env: 'staging',
        sql: "SELECT id, name FROM workspaces WHERE name = 'Tuturuuu' ORDER BY id DESC LIMIT 25",
      })
    );

    expect(mocks.connection).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.from).toHaveBeenCalledWith('workspaces');
    expect(mocks.builderCalls).toEqual([
      { args: ['id,name'], method: 'select' },
      { args: ['name', 'Tuturuuu'], method: 'eq' },
      { args: ['id', { ascending: false }], method: 'order' },
      { args: [25], method: 'limit' },
      { args: [expect.any(AbortSignal)], method: 'abortSignal' },
    ]);

    const body = await response.json();
    expect(body.rowCount).toBe(1);
    expect(body.rows).toEqual([{ id: 'ws-1', name: 'Tuturuuu' }]);
    expect(body.limit).toBe(25);
    expect(body.tables).toEqual(['workspaces']);
    expect(body.normalizedSql).toBe(
      "SELECT id, name FROM public.workspaces WHERE name = 'Tuturuuu' ORDER BY id DESC LIMIT 25"
    );
    expect(body.requestId).toBe('req-db-readonly-001');
    expect(typeof body.sqlHash).toBe('string');
    expect(body.sqlHash).toHaveLength(64);

    expect(infoSpy).toHaveBeenCalledWith(
      '[db_cli_readonly] query_executed',
      expect.objectContaining({
        actorId: 'root-staff-user-1',
        durationMs: expect.any(Number),
        env: 'staging',
        limit: 25,
        requestId: 'req-db-readonly-001',
        rowCount: 1,
        sqlHash: body.sqlHash,
        tables: ['workspaces'],
      })
    );

    const serializedAudit = JSON.stringify(infoSpy.mock.calls);
    expect(serializedAudit).not.toContain('ttr_app_super_secret_token_value');
    expect(serializedAudit).not.toContain('authorization');
  });
});
