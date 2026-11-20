import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listExpired: vi.fn(),
  deleteQaUsers: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withCronLogDrain: (_options: unknown, handler: () => Promise<Response>) =>
    handler(),
}));
vi.mock('@/lib/qa-test-users/store', () => ({
  createQaStore: () => ({ listExpired: mocks.listExpired }),
}));
vi.mock('@/lib/qa-test-users/runtime', () => ({
  createQaDeletionDeps: () => ({}),
}));
vi.mock('@/lib/qa-test-users/deletion', () => ({
  deleteQaUsers: mocks.deleteQaUsers,
}));

import { POST } from './route';

const SECRET = 'disposable-cron-secret-value';
const call = (authorization?: string) =>
  POST(
    new Request('https://tuturuuu.com/api/cron/qa/test-user-cleanup', {
      method: 'POST',
      headers: authorization ? { authorization } : {},
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', SECRET);
  mocks.listExpired.mockResolvedValue({ mode: 'run', userIds: ['u1', 'u2'] });
  mocks.deleteQaUsers.mockResolvedValue({
    fenced: false,
    deleted: ['u1', 'u2'],
    pending: [],
    skipped: [],
  });
});

describe('QA test user cleanup cron', () => {
  it('rejects a missing or wrong secret without touching the ledger', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await call(`Bearer ${SECRET}`)).status).toBe(401);
    expect(mocks.listExpired).not.toHaveBeenCalled();
  });

  it('deletes at most one bounded batch as the cron actor', async () => {
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      deleted: 2,
      pending: 0,
      skipped: 0,
    });
    expect(mocks.listExpired).toHaveBeenCalledWith(25);
    expect(mocks.deleteQaUsers).toHaveBeenCalledWith(
      {},
      ['u1', 'u2'],
      'cron',
      null,
      expect.objectContaining({ deadline: expect.any(Number) })
    );
  });

  it('honors the database stop fence', async () => {
    mocks.listExpired.mockResolvedValue({ mode: 'fenced', userIds: [] });
    const response = await call(`Bearer ${SECRET}`);
    expect(await response.json()).toEqual({ ok: true, fenced: true });
    expect(mocks.deleteQaUsers).not.toHaveBeenCalled();
  });

  it('reports unsettled deletions as a failed slot', async () => {
    mocks.deleteQaUsers.mockResolvedValue({
      fenced: false,
      deleted: [],
      pending: ['u1'],
      skipped: [],
    });
    expect((await call(`Bearer ${SECRET}`)).status).toBe(502);
  });
});
