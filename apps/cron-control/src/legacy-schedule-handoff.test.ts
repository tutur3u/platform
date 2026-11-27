import { expect, it, vi } from 'vite-plus/test';
import { dispatchScheduledJobs } from './dispatch';
import { parseEnabledJobs } from './jobs';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';

const scheduledTime = Date.parse('2026-10-23T12:00:00.000Z');
const env = {
  CRON_SECRET_INFRASTRUCTURE: 'fixture-infrastructure-cron-secret',
  INFRASTRUCTURE_ORIGIN: 'https://infrastructure.example.test',
};

it.each([
  [
    'calendar-smart-schedule',
    '0 */6 * * *',
    '/api/cron/calendar/smart-schedule',
    1,
  ],
  [
    'infrastructure-sync-trust-cache',
    '*/10 * * * *',
    '/api/cron/infrastructure/sync-trust-cache',
    2,
  ],
] as const)(
  'dispatches %s on its legacy trigger with Infrastructure auth',
  async (id, cron, path, attempts) => {
    const calls: { url: URL; init?: RequestInit }[] = [];
    const ledger = localLedger(new LedgerCore(memoryLedgerStore().store));
    const deps = {
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: new URL(String(input)), init });
        return Response.json({ ok: false }, { status: 503 });
      }) as typeof fetch,
      ledger: () => ledger,
      now: () => scheduledTime,
      sleep: async () => {},
    };
    const enabled = { ...env, CRON_CONTROL_ENABLED_JOBS: id };
    expect(
      await dispatchScheduledJobs(cron, scheduledTime, enabled, deps)
    ).toEqual([{ id, attempts, outcome: 'failed', status: 503 }]);
    expect(calls).toHaveLength(attempts);
    for (const call of calls) {
      expect(call.url.href).toBe(new URL(path, env.INFRASTRUCTURE_ORIGIN).href);
      expect(call.init?.method).toBe('GET');
      expect(new Headers(call.init?.headers).get('authorization')).toBe(
        `Bearer ${env.CRON_SECRET_INFRASTRUCTURE}`
      );
    }
  }
);

it('does not admit retired Docker monitoring jobs through the allowlist', () => {
  const retiredJobs = [
    'infrastructure-docker-recovery-alerts',
    'infrastructure-sample-resources',
  ];
  const parsed = parseEnabledJobs(retiredJobs.join(','));
  expect(parsed.enabled.size).toBe(0);
  expect(parsed.unknown).toEqual(retiredJobs);
});
