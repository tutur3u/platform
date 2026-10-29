import { NextRequest } from 'next/server';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  upsert: vi.fn(async () => ({ error: null })),
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withCronLogDrain: async (_context: unknown, run: () => Promise<unknown>) =>
    run(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: () => ({ upsert: mocks.upsert }) }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('SR-270 requires cron authentication even when DEV_MODE is true', async () => {
  vi.stubEnv('DEV_MODE', 'true');
  vi.stubEnv('CRON_SECRET', 'fixture-cron');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'fixture-service');
  mocks.fetch.mockResolvedValue(
    Response.json({ date: '2026-01-01', usd: { vnd: 25000 } })
  );
  vi.stubGlobal('fetch', mocks.fetch);
  const { POST } = await import('./route');
  expect(
    (
      await POST(
        new NextRequest('http://localhost/api/cron', { method: 'POST' })
      )
    ).status
  ).toBe(401);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.upsert).not.toHaveBeenCalled();
});
