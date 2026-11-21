import { NextRequest } from 'next/server';
import { dispatchEndpoint } from '@tuturuuu/start-bridge/endpoints';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jobs = vi.hoisted(() => ({
  sample: vi.fn(),
  snapshot: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
  cache: vi.fn(),
  email: vi.fn(),
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withCronLogDrain: (_options: unknown, run: () => Promise<Response>) => run(),
}));
vi.mock('@/lib/infrastructure/observability', () => ({
  sampleObservabilityResources: jobs.sample,
}));
vi.mock('@/lib/infrastructure/blue-green-monitoring', () => ({
  readBlueGreenMonitoringSnapshot: jobs.snapshot,
}));
vi.mock('@/lib/infrastructure/blue-green-monitoring-controls', () => ({
  readBlueGreenDockerRecoveryAlertState: vi.fn(),
  writeBlueGreenDockerRecoveryAlertState: vi.fn(),
}));
vi.mock('@tuturuuu/email-service', () => ({ sendSystemEmail: jobs.email }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: jobs.admin,
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge-trust', () => ({
  setCachedTrustEntry: jobs.cache,
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
import { GET as sample } from '@/app/api/cron/infrastructure/sample-resources/route';
import { GET as docker } from '@/app/api/cron/infrastructure/docker-recovery-alerts/route';
import { GET as trust } from '@/app/api/cron/infrastructure/sync-trust-cache/route';

const routes = [
  {
    name: 'sample',
    path: '/api/cron/infrastructure/sample-resources',
    handler: sample,
    effect: jobs.sample,
  },
  {
    name: 'docker',
    path: '/api/cron/infrastructure/docker-recovery-alerts',
    handler: docker,
    effect: jobs.snapshot,
  },
  {
    name: 'trust',
    path: '/api/cron/infrastructure/sync-trust-cache',
    handler: trust,
    effect: jobs.admin,
  },
];
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CRON_SECRET', 'test-cron-secret');
  vi.stubEnv('VERCEL_CRON_SECRET', '');
  vi.stubEnv('PLATFORM_DOCKER_RECOVERY_ALERT_EMAILS', '');
  jobs.sample.mockResolvedValue({ privateData: 'private-sample' });
  jobs.snapshot.mockReturnValue({
    control: { dockerRecoverySettings: { emailAlertsEnabled: false } },
  });
  jobs.admin.mockResolvedValue({ rpc: jobs.rpc });
  jobs.rpc.mockResolvedValue({
    data: [{ subject_key: 'private-subject', trust_multiplier: 2 }],
    error: null,
  });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

for (const route of routes) {
  describe(route.name, () => {
    it('rejects authenticated implicit HEAD dispatch before cron effects', async () => {
      const response = await dispatchEndpoint(
        [{ pattern: route.path, module: { GET: route.handler } }],
        new NextRequest('https://infrastructure.tuturuuu.com' + route.path, {
          method: 'HEAD',
          headers: { authorization: 'Bearer test-cron-secret' },
        })
      );
      expect(response?.status).toBe(405);
      for (const job of Object.values(jobs)) expect(job).not.toHaveBeenCalled();
    });
    it('preserves authenticated GET dispatch and its job effect', async () => {
      const response = await dispatchEndpoint(
        [{ pattern: route.path, module: { GET: route.handler } }],
        new NextRequest('https://infrastructure.tuturuuu.com' + route.path, {
          headers: { authorization: 'Bearer test-cron-secret' },
        })
      );
      expect(response?.status).toBe(200);
      expect(route.effect).toHaveBeenCalledTimes(1);
    });

    for (const authorization of [
      undefined,
      'Bearer wrong',
      'Basic test-cron-secret',
      'Bearer',
      'Bearer test-cron-secret, Bearer test-cron-secret',
      'Bearer  test-cron-secret',
    ]) {
      it(
        'denies absent, wrong or malformed bearer before job effects: ' +
          authorization,
        async () => {
          const headers = new Headers({ cookie: 'session=eligible-admin' });
          if (authorization) headers.set('authorization', authorization);
          const response = await route.handler(
            new NextRequest(
              'http://localhost/api/cron/infrastructure/' + route.name,
              { headers }
            )
          );
          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({ ok: false });
          for (const job of Object.values(jobs))
            expect(job).not.toHaveBeenCalled();
        }
      );
    }
    it('denies duplicate authorization headers', async () => {
      const headers = new Headers();
      headers.append('Authorization', 'Bearer test-cron-secret');
      headers.append('Authorization', 'Bearer test-cron-secret');
      const response = await route.handler(
        new NextRequest('http://localhost', { headers })
      );
      expect(response.status).toBe(401);
      for (const job of Object.values(jobs)) expect(job).not.toHaveBeenCalled();
    });
    it('sanitizes job failures in responses and logs', async () => {
      route.effect.mockImplementation(() => {
        throw new Error('private-test-cron-secret');
      });
      const response = await route.handler(
        new NextRequest('http://localhost', {
          headers: { authorization: 'Bearer test-cron-secret' },
        })
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ ok: false });
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        'private-test-cron-secret'
      );
    });
    it('supports the configured fallback secret', async () => {
      delete process.env.CRON_SECRET;
      vi.stubEnv('VERCEL_CRON_SECRET', 'test-cron-secret');
      const response = await route.handler(
        new NextRequest('http://localhost', {
          headers: { authorization: 'Bearer test-cron-secret' },
        })
      );
      expect(response.status).toBe(200);
      expect(route.effect).toHaveBeenCalledTimes(1);
    });
    it('fails closed when secret is missing', async () => {
      vi.stubEnv('CRON_SECRET', '');
      const response = await route.handler(
        new NextRequest('http://localhost', {
          headers: { authorization: 'Bearer test-cron-secret' },
        })
      );
      expect(response.status).toBe(401);
      for (const job of Object.values(jobs)) expect(job).not.toHaveBeenCalled();
    });
    it('runs only its authorized job and returns minimal status', async () => {
      const response = await route.handler(
        new NextRequest('http://localhost', {
          headers: { authorization: 'Bearer test-cron-secret' },
        })
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(route.effect).toHaveBeenCalledTimes(1);
      for (const other of routes.filter((entry) => entry !== route))
        expect(other.effect).not.toHaveBeenCalled();
      if (route.name === 'trust')
        expect(jobs.cache).toHaveBeenCalledWith(
          'private-subject',
          { m: 2 },
          7200
        );
    });
  });
}
