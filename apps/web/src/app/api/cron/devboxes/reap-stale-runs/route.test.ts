import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), schema: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ schema: mocks.schema }),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { GET, POST } from './route';

const authorized = (method = 'POST') =>
  new Request('http://localhost/api/cron/devboxes/reap-stale-runs', {
    headers: { authorization: 'Bearer test-secret' },
    method,
  });

describe('stale devbox run reaper route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'test-secret');
    mocks.schema.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: 3, error: null });
  });

  it('rejects missing or wrong credentials without touching runs', async () => {
    const missing = await POST(
      new Request('http://localhost/cron', { method: 'POST' })
    );
    const wrong = await POST(
      new Request('http://localhost/cron', {
        headers: { authorization: 'Bearer nope' },
        method: 'POST',
      })
    );

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('fails closed when the secret is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '');

    expect((await POST(authorized())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('runs one bounded private reap per request', async () => {
    const response = await POST(authorized());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ limit: 200, reaped: 3 });
    expect(mocks.schema).toHaveBeenCalledWith('private');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('reap_stale_devbox_runs', {
      p_limit: 200,
    });
    expect((await GET(authorized('GET'))).status).toBe(200);
  });

  it('reports storage failures as 500', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect((await POST(authorized())).status).toBe(500);
  });
});
