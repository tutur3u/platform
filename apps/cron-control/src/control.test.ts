import { expect, it, vi } from 'vite-plus/test';
import { handleControlRequest } from './control';
import {
  CRON_JOBS,
  CRON_TRIGGERS,
  leaseMs,
  parseEnabledJobs,
  scheduleSlot,
} from './jobs';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';

const TOKEN = 'operator-token-that-is-long-enough-123';

function setup(env: Record<string, string> = {}) {
  const core = new LedgerCore(memoryLedgerStore().store);
  const ledger = vi.fn(() => localLedger(core));
  const call = (path: string, method = 'GET', token = TOKEN) =>
    handleControlRequest(
      new Request(`https://cron.example.test${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        method,
      }),
      { CRON_CONTROL_OPERATOR_TOKEN: TOKEN, ...env },
      ledger
    );
  return { call, core, ledger };
}

it('leaves non-control paths to the caller', async () => {
  expect(await setup().call('/health')).toBeNull();
});

it('hides every control path without a valid long token', async () => {
  for (const [token, env] of [
    ['', {}],
    ['wrong-token-that-is-long-enough-12345', {}],
    ['short', { CRON_CONTROL_OPERATOR_TOKEN: 'short' }],
  ] as const) {
    const { call, ledger } = setup(env);
    for (const [path, method] of [
      ['/control/jobs', 'GET'],
      ['/control/jobs/pay-products/stop', 'POST'],
    ]) {
      const response = await call(path, method, token);
      expect(response?.status).toBe(404);
    }
    expect(ledger).not.toHaveBeenCalled();
  }
});

it('stops and resumes a job durably without enabling it', async () => {
  const { call, core } = setup();
  const stopped = await call('/control/jobs/pay-products/stop', 'POST');
  expect(stopped?.status).toBe(200);
  expect(core.status()['pay-products']).toMatchObject({
    stopReason: 'operator',
    stopped: true,
  });
  await call('/control/jobs/pay-products/resume', 'POST');
  const listing = (await (await call('/control/jobs'))?.json()) as {
    jobs: { enabled: boolean; id: string; state: { stopped: boolean } }[];
  };
  expect(listing.jobs).toHaveLength(CRON_JOBS.length);
  expect(listing.jobs.find((job) => job.id === 'pay-products')).toMatchObject({
    enabled: false,
    state: { generation: 2, stopped: false },
  });
});

it('rejects unknown jobs and methods', async () => {
  const { call } = setup();
  expect((await call('/control/jobs/unknown/stop', 'POST'))?.status).toBe(404);
  expect((await call('/control/jobs/pay-products/stop', 'GET'))?.status).toBe(
    404
  );
  expect((await call('/control/jobs', 'DELETE'))?.status).toBe(404);
});

it('catalog ids are unique and every cadence has a trigger', () => {
  const ids = CRON_JOBS.map((job) => job.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const job of CRON_JOBS) {
    expect(CRON_TRIGGERS).toContain(job.cron);
    if (job.workerProcessor === 'cron-history-retention')
      expect(job.path).toBe('/rest/v1/rpc/prune_cron_history');
    else expect(job.path).toMatch(/^\/api\/cron\/[a-z0-9/-]+$/);
    expect(leaseMs(job)).toBeGreaterThan(job.timeoutMs);
  }
});

it('enable flags default off and only accept catalog ids', () => {
  expect(parseEnabledJobs(undefined).enabled.size).toBe(0);
  expect(parseEnabledJobs('').enabled.size).toBe(0);
  expect(parseEnabledJobs(' pay-products ,,x ')).toEqual({
    enabled: new Set(['pay-products']),
    unknown: ['x'],
  });
});

it('slots are the scheduled minute regardless of delivery delay', () => {
  const minute = Date.parse('2026-10-23T03:17:00.000Z');
  expect(scheduleSlot(minute + 59_999)).toBe('2026-10-23T03:17:00.000Z');
});
