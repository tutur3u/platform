import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fill,
  registerRateLimitStore,
  store,
} from '@/lib/external-apps/rate-limit-test-support';

const WS_1 = '22222222-2222-4222-8222-222222222222';
const WS_2 = '33333333-3333-4333-8333-333333333333';
// The access helper resolves handles to the workspace id the handler sees.
const RESOLVED: Record<string, string> = {
  acme: WS_1,
  [WS_1]: WS_1,
  [WS_2]: WS_2,
};

const cron = vi.hoisted(() => ({
  runNow: vi.fn(),
  userId: 'member-1',
}));

vi.mock('@/lib/external-apps/workspace-cron', () => ({
  externalAppWorkspaceCronScopes: {
    cronRead: 'workspace:cron:read',
    cronWrite: 'workspace:cron:write',
  },
  handleExternalAppWorkspaceCronRoute: async ({
    handler,
    wsId,
  }: {
    handler: (access: unknown) => Promise<Response>;
    wsId: string;
  }) =>
    handler({
      normalizedWorkspaceId: RESOLVED[wsId],
      targetApp: { id: 'yoola' },
      user: { email: null, id: cron.userId },
    }),
  runExternalAppWorkspaceCronJobNow: (...args: unknown[]) =>
    cron.runNow(...args),
}));

async function runNow(wsId: string, jobKey = 'nightly', userId = 'member-1') {
  cron.userId = userId;
  const { POST } = await import('./route');
  return POST(new Request('http://localhost/run-now', { method: 'POST' }), {
    params: Promise.resolve({ jobKey, wsId }),
  });
}

const key = (bucket: string, wsId = WS_1, job = 'nightly') =>
  `external-app:${bucket}:app:yoola:ws:${wsId}:job:${job}`;

describe('external-app cron run-now per-job limit', () => {
  registerRateLimitStore();

  beforeEach(() => {
    cron.runNow.mockReset();
    cron.runNow.mockResolvedValue(Response.json({ result: 'queued' }));
  });

  it('allows one run a minute per job, counted once per window', async () => {
    expect((await runNow(WS_1)).status).toBe(200);
    expect(store.calls.sort()).toEqual([
      key('runNowHour'),
      key('runNowMinute'),
    ]);

    const again = await runNow(WS_1);
    expect(again.status).toBe(429);
    expect(Number(again.headers.get('Retry-After'))).toBeLessThanOrEqual(60);
    expect(cron.runNow).toHaveBeenCalledTimes(1);
  });

  it('shares one budget across workspace aliases and members', async () => {
    expect((await runNow(WS_1)).status).toBe(200);

    expect((await runNow('acme')).status).toBe(429);
    expect((await runNow(WS_1, 'nightly', 'member-2')).status).toBe(429);
  });

  it('keeps jobs and workspaces apart', async () => {
    expect((await runNow(WS_1)).status).toBe(200);

    expect((await runNow(WS_1, 'weekly')).status).toBe(200);
    expect((await runNow(WS_2)).status).toBe(200);
  });

  it('caps each job at ten runs an hour', async () => {
    fill(`app:yoola:ws:${WS_1}:job:nightly`, 'runNowHour');

    const response = await runNow(WS_1);

    expect(response.status).toBe(429);
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(60);
    expect(cron.runNow).not.toHaveBeenCalled();
  });

  it('refuses with 503 while the limiter is unavailable', async () => {
    store.down = true;

    expect((await runNow(WS_1)).status).toBe(503);
    expect(cron.runNow).not.toHaveBeenCalled();
  });
});
