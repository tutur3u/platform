import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  create: vi.fn(),
  listUsers: vi.fn(),
  listExpired: vi.fn(),
  deleteOne: vi.fn(),
  deleteMany: vi.fn(),
  mint: vi.fn(),
  getUserById: vi.fn(),
}));
vi.mock('@/lib/qa-test-users/authorization', () => ({
  requireQaOperator: mocks.access,
}));
vi.mock('@/lib/qa-test-users/provision', () => ({
  createQaUsers: mocks.create,
}));
vi.mock('@/lib/qa-test-users/deletion', () => ({
  deleteQaUser: mocks.deleteOne,
  deleteQaUsers: mocks.deleteMany,
}));
vi.mock('@/lib/qa-test-users/session', async (original) => ({
  ...(await original<typeof import('@/lib/qa-test-users/session')>()),
  mintQaSession: mocks.mint,
}));
vi.mock('@/lib/qa-test-users/runtime', () => ({
  createQaProvisionDeps: () => ({}),
  createQaDeletionDeps: () => ({}),
  createQaSessionDeps: () => ({ supabaseUrl: 'https://db.example.test' }),
}));
vi.mock('@/lib/qa-test-users/store', async (original) => ({
  ...(await original<typeof import('@/lib/qa-test-users/store')>()),
  createQaStore: () => ({
    listUsers: mocks.listUsers,
    listExpired: mocks.listExpired,
  }),
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(async () => undefined),
}));
vi.mock('@tuturuuu/supabase/next/common', () => ({
  getSupabaseCookieOptions: () => ({}),
}));

import { DELETE } from './[userId]/route';
import { POST as SESSION } from './[userId]/session/route';
import { POST as CLEANUP } from './cleanup/route';
import { GET, POST } from './route';

const OP = '33333333-3333-4333-8333-333333333333';
const HUMAN = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const claims = {
  repository: 'tutur3u/platform',
  runId: '987654321',
  runAttempt: '1',
  sha: 'c'.repeat(40),
  eventName: 'workflow_dispatch',
  actor: 'vhpx',
};
const row = (overrides: Record<string, unknown> = {}) => ({
  userId: TARGET,
  email: 'qa+abcd1234-1@tutur3u.com',
  runId: 'abcd1234',
  ordinal: 1,
  staff: false,
  tier: 'FREE',
  state: 'active',
  purpose: 'upskii-e2e',
  operatorUserId: OP,
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  runWorkspaceId: null,
  createdAt: new Date().toISOString(),
  deletedAt: null,
  ...overrides,
});
const marker = (overrides: Record<string, unknown> = {}) => ({
  data: {
    user: {
      id: TARGET,
      app_metadata: {
        qa_test: true,
        qa_owner: OP,
        qa_purpose: 'upskii-e2e',
        ...overrides,
      },
    },
  },
  error: null,
});
const json = (path: string, body: unknown, method = 'POST') =>
  new Request(`https://tuturuuu.com/api/v1/admin/qa/test-users${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ userId: TARGET }) };
let info: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({
    ok: true,
    admin: { auth: { admin: { getUserById: mocks.getUserById } } },
    operator: { id: OP },
    principal: { kind: 'github-ci', claims },
  });
  mocks.getUserById.mockResolvedValue(marker());
  mocks.listUsers.mockResolvedValue([]);
  info = vi.spyOn(console, 'info').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const audited = (spy: typeof info, operation: string, detail: object) =>
  expect(spy).toHaveBeenCalledWith(
    '[qa-ci-operator] call',
    expect.objectContaining({
      operation,
      repository: 'tutur3u/platform',
      githubRunId: '987654321',
      runAttempt: '1',
      sha: 'c'.repeat(40),
      eventName: 'workflow_dispatch',
      ...detail,
    })
  );

describe('QA admin routes for the GitHub OIDC principal', () => {
  it('lists only its own upskii-e2e accounts, live or deleting', async () => {
    const own = [row(), row({ state: 'deleting', userId: HUMAN })];
    mocks.listUsers.mockResolvedValue([
      ...own,
      row({ operatorUserId: HUMAN }),
      row({ purpose: 'meet-load' }),
    ]);
    const response = await GET(
      new Request('https://tuturuuu.com/api/v1/admin/qa/test-users')
    );
    expect(response.status).toBe(200);
    expect((await response.json()).users).toEqual(own);
    expect(mocks.listUsers).toHaveBeenCalledWith(null, false);
    audited(info, 'list', { outcome: 'ok', rows: 2 });
  });

  it('hides a foreign run from a run-scoped list', async () => {
    mocks.listUsers.mockResolvedValue([row({ operatorUserId: HUMAN })]);
    const response = await GET(
      new Request(
        'https://tuturuuu.com/api/v1/admin/qa/test-users?run=abcd1234'
      )
    );
    expect((await response.json()).users).toEqual([]);
    expect(mocks.listUsers).toHaveBeenCalledWith('abcd1234', false);
  });

  it('appends to its own run within the caps', async () => {
    mocks.listUsers.mockResolvedValue([row({ staff: true })]);
    mocks.create.mockResolvedValue({
      runId: 'abcd1234',
      users: [{}],
      failed: [],
    });
    expect((await POST(json('', { runId: 'abcd1234', count: 3 }))).status).toBe(
      201
    );
    const over = await POST(
      json('', { runId: 'abcd1234', count: 1, staff: true })
    );
    expect(over.status).toBe(403);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('audits an invalid request after authentication', async () => {
    const response = await DELETE(
      new Request('https://tuturuuu.com/x', { method: 'DELETE' }),
      { params: Promise.resolve({ userId: 'nope' }) }
    );
    expect(response.status).toBe(400);
    audited(warn, 'delete', { outcome: 'invalid' });
  });

  it('creates a capped upskii-e2e run and audits it', async () => {
    mocks.create.mockResolvedValue({
      runId: 'abcd1234',
      users: [{ password: 'secret-password' }],
      failed: [],
    });
    const response = await POST(
      json('', {
        count: 2,
        purpose: 'upskii-e2e',
        ttlSeconds: 3600,
        workspace: true,
      })
    );
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      {},
      OP,
      expect.objectContaining({ count: 2, workspace: true })
    );
    audited(info, 'create', { outcome: 'ok', qaRunId: 'abcd1234', created: 1 });
    expect(JSON.stringify(info.mock.calls)).not.toContain('secret-password');
  });

  it.each([
    ['purpose', { count: 1, purpose: 'meet-load', ttlSeconds: 3600 }],
    ['ttl', { count: 1, purpose: 'upskii-e2e', ttlSeconds: 7201 }],
    ['count', { count: 5, purpose: 'upskii-e2e', ttlSeconds: 3600 }],
    [
      'staff',
      { count: 2, staff: true, purpose: 'upskii-e2e', ttlSeconds: 3600 },
    ],
    [
      'tier',
      { count: 1, tier: 'plus', purpose: 'upskii-e2e', ttlSeconds: 3600 },
    ],
  ])('refuses a create over the %s cap', async (reason, body) => {
    const response = await POST(json('', body));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason });
    expect(mocks.create).not.toHaveBeenCalled();
    audited(warn, 'create', { outcome: 'refused', reason });
  });

  it('refuses a create past the daily run cap', async () => {
    mocks.listUsers.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) =>
        row({ runId: `run0000${index}` })
      )
    );
    const response = await POST(
      json('', { count: 1, purpose: 'upskii-e2e', ttlSeconds: 3600 })
    );
    expect(response.status).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([
    ['another operator', { qa_owner: HUMAN }],
    ['another purpose', { qa_purpose: 'meet-load' }],
  ])('refuses to delete an account of %s', async (_label, overrides) => {
    mocks.getUserById.mockResolvedValue(marker(overrides));
    const response = await DELETE(
      new Request('https://tuturuuu.com/x', { method: 'DELETE' }),
      params
    );
    expect(response.status).toBe(403);
    expect(mocks.deleteOne).not.toHaveBeenCalled();
    audited(warn, 'delete', { outcome: 'refused', reason: 'target_foreign' });
  });

  it('deletes its own account', async () => {
    mocks.deleteOne.mockResolvedValue('deleted');
    const response = await DELETE(
      new Request('https://tuturuuu.com/x', { method: 'DELETE' }),
      params
    );
    expect(response.status).toBe(200);
    expect(mocks.deleteOne).toHaveBeenCalledWith({}, TARGET, 'operator', OP);
    audited(info, 'delete', { outcome: 'deleted', userId: TARGET });
  });

  it('refuses to mint a session for a foreign account', async () => {
    mocks.getUserById.mockResolvedValue(marker({ qa_owner: HUMAN }));
    const response = await SESSION(json(`/${TARGET}/session`, {}), params);
    expect(response.status).toBe(403);
    expect(mocks.mint).not.toHaveBeenCalled();
  });

  it('mints a session for its own account without logging tokens', async () => {
    mocks.mint.mockResolvedValue({
      runId: 'abcd1234',
      session: {
        accessToken: 'access-token-value',
        refreshToken: 'refresh-value',
      },
    });
    const response = await SESSION(json(`/${TARGET}/session`, {}), params);
    expect(response.status).toBe(201);
    audited(info, 'session', { outcome: 'ok', qaRunId: 'abcd1234' });
    expect(JSON.stringify(info.mock.calls)).not.toContain('access-token-value');
  });

  it('still refuses browser requests before authenticating', async () => {
    const request = new Request(`https://tuturuuu.com/x/${TARGET}/session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://tuturuuu.com',
        'sec-fetch-site': 'same-origin',
      },
      body: '{}',
    });
    expect((await SESSION(request, params)).status).toBe(403);
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it('refuses the global expired cleanup', async () => {
    const response = await CLEANUP(json('/cleanup', { expired: true }));
    expect(response.status).toBe(403);
    expect(mocks.listExpired).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    audited(warn, 'cleanup', { outcome: 'refused', reason: 'global_cleanup' });
  });

  it('refuses to clean up a foreign run', async () => {
    mocks.listUsers.mockResolvedValue([row({ operatorUserId: HUMAN })]);
    const response = await CLEANUP(json('/cleanup', { runId: 'abcd1234' }));
    expect(response.status).toBe(403);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it('cleans up its own run', async () => {
    mocks.listUsers.mockResolvedValue([
      row(),
      row({ state: 'deleted', userId: HUMAN }),
    ]);
    mocks.deleteMany.mockResolvedValue({
      fenced: false,
      deleted: [TARGET],
      pending: [],
      skipped: [],
    });
    const response = await CLEANUP(json('/cleanup', { runId: 'abcd1234' }));
    expect(response.status).toBe(200);
    expect(mocks.listUsers).toHaveBeenCalledWith('abcd1234', true);
    expect(mocks.deleteMany).toHaveBeenCalledWith(
      {},
      [TARGET],
      'operator',
      OP,
      expect.anything()
    );
    audited(info, 'cleanup', {
      outcome: 'ok',
      qaRunId: 'abcd1234',
      deleted: 1,
    });
  });
});
