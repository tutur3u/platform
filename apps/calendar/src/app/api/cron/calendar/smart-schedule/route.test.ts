import { NextRequest } from 'next/server';
import { afterEach, expect, it, vi } from 'vitest';

const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({ createAdminClient: admin }));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withCronLogDrain: (_: unknown, run: () => unknown) => run(),
}));
import { GET } from './route';

const policyKey = Symbol.for('tuturuuu.internalApi.webApiOriginPolicy');
afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[policyKey];
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('refuses an untrusted schedule origin before forwarding the cron credential', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture-cron-secret');
  vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://evil.example');
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const eq = vi.fn().mockReturnValueOnce({
    eq: async () => ({ data: [{ ws_id: 'fixture-workspace' }] }),
  });
  admin.mockResolvedValue({ from: () => ({ select: () => ({ eq }) }) });
  (globalThis as Record<symbol, unknown>)[policyKey] = () => {
    throw new Error('Untrusted Web origin');
  };
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const response = await GET(
    new NextRequest(
      'https://calendar.tuturuuu.com/api/cron/calendar/smart-schedule',
      {
        headers: { Authorization: 'Bearer fixture-cron-secret' },
      }
    )
  );
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({
    error: 'Untrusted Web origin',
  });
  expect(fetch).not.toHaveBeenCalled();
});

it('schedules each nonempty string workspace ID once', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture-cron-secret');
  vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://tuturuuu.com');
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const eq = vi.fn().mockReturnValueOnce({
    eq: async () => ({
      data: [null, 42, '', 'fixture-workspace', 'fixture-workspace'].map(
        (ws_id) => ({ ws_id })
      ),
    }),
  });
  admin.mockResolvedValue({ from: () => ({ select: () => ({ eq }) }) });
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ summary: { eventsCreated: 2 } }));
  vi.stubGlobal('fetch', fetch);
  const response = await GET(
    new NextRequest(
      'https://calendar.tuturuuu.com/api/cron/calendar/smart-schedule',
      { headers: { Authorization: 'Bearer fixture-cron-secret' } }
    )
  );
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]?.[0]).toBe(
    'https://tuturuuu.com/api/v1/workspaces/fixture-workspace/calendar/schedule'
  );
  expect(await response.json()).toMatchObject({
    summary: { workspacesProcessed: 1, successful: 1, failed: 0 },
  });
});
