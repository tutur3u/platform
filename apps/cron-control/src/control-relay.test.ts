import { expect, it, vi } from 'vite-plus/test';
import { handleControlRequest } from './control';
import { CRON_JOBS, MAX_CONSECUTIVE_FAILURES } from './jobs';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';

const OPERATOR = 'operator-token-that-is-long-enough-123';
const RELAY = 'relay-token-that-is-long-enough-1234567';
const JOB = 'calendar-provider-sync';
const DISABLED = 'pay-products';

function setup(env: Record<string, string> = {}) {
  const core = new LedgerCore(memoryLedgerStore().store);
  const ledger = vi.fn(() => localLedger(core));
  const call = (path: string, method = 'GET', token = RELAY) =>
    handleControlRequest(
      new Request(`https://cron-control.internal${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        method,
      }),
      {
        CRON_CONTROL_ENABLED_JOBS: JOB,
        CRON_CONTROL_OPERATOR_TOKEN: OPERATOR,
        CRON_CONTROL_RELAY_TOKEN: RELAY,
        ...env,
      },
      ledger
    );
  return { call, core, ledger };
}

/** Stops the job the way its own failure budget does. */
function exhaust(core: LedgerCore, jobId: string) {
  for (let run = 0; run < MAX_CONSECUTIVE_FAILURES; run++) {
    const slot = `2026-11-22T06:0${run}:00.000Z`;
    const claim = core.claim({
      jobId,
      leaseMs: 500,
      maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
      now: run * 1000,
      slot,
    });
    if (!claim.granted) throw new Error('claim refused');
    core.complete({
      generation: claim.generation,
      jobId,
      maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
      now: run * 1000 + 1,
      outcome: 'failed',
      slot,
    });
  }
}

it('hides the relay routes without a valid long relay token', async () => {
  for (const [token, env] of [
    ['', {}],
    ['wrong-token-that-is-long-enough-12345', {}],
    [RELAY, { CRON_CONTROL_RELAY_TOKEN: '' }],
    ['short', { CRON_CONTROL_RELAY_TOKEN: 'short' }],
  ] as const) {
    const { call, ledger } = setup(env);
    expect((await call('/control/jobs', 'GET', token))?.status).toBe(404);
    expect(
      (await call(`/control/jobs/${JOB}/resume`, 'POST', token))?.status
    ).toBe(404);
    expect(ledger).not.toHaveBeenCalled();
  }
});

it('lists every job for the relay without queued work', async () => {
  const { call, core } = setup();
  core.addPendingWork(JOB, ['private-item']);
  const response = await call('/control/jobs');
  expect(response?.status).toBe(200);
  expect(response?.headers.get('Cache-Control')).toBe('no-store');
  const text = (await response?.text()) ?? '';
  expect(text).not.toContain('private-item');
  const { jobs } = JSON.parse(text) as {
    jobs: { enabled: boolean; id: string; state: { stopped: boolean } }[];
  };
  expect(jobs).toHaveLength(CRON_JOBS.length);
  expect(jobs.find((job) => job.id === JOB)).toMatchObject({
    enabled: true,
    state: { stopped: false },
  });
  const operator = await call('/control/jobs', 'GET', OPERATOR);
  expect(await operator?.text()).toContain('private-item');
});

it('resumes a job its failure budget stopped, on a new generation', async () => {
  const { call, core } = setup();
  exhaust(core, JOB);
  const before = core.status()[JOB]!;
  expect(before).toMatchObject({
    stopReason: 'failure-budget-exhausted',
    stopped: true,
  });
  const response = await call(`/control/jobs/${JOB}/resume`, 'POST');
  expect(response?.status).toBe(200);
  expect(await response?.json()).toMatchObject({
    id: JOB,
    result: 'resumed',
    state: {
      consecutiveFailures: 0,
      generation: before.generation + 1,
      stopReason: null,
      stopped: false,
    },
  });
  // A second resume changes nothing.
  const again = await call(`/control/jobs/${JOB}/resume`, 'POST');
  expect(again?.status).toBe(409);
  expect(await again?.json()).toMatchObject({ result: 'not_stopped' });
  expect(core.status()[JOB]?.generation).toBe(before.generation + 1);
});

it('refuses unknown and disabled jobs', async () => {
  const { call, core, ledger } = setup();
  expect((await call('/control/jobs/unknown/resume', 'POST'))?.status).toBe(
    404
  );
  exhaust(core, DISABLED);
  const disabled = await call(`/control/jobs/${DISABLED}/resume`, 'POST');
  expect(disabled?.status).toBe(409);
  expect(await disabled?.json()).toEqual({ id: DISABLED, result: 'disabled' });
  expect(core.status()[DISABLED]?.stopped).toBe(true);
  expect(ledger).not.toHaveBeenCalled();
});

it('leaves an operator stop in force', async () => {
  const { call, core } = setup();
  core.stop(JOB, 'operator');
  const response = await call(`/control/jobs/${JOB}/resume`, 'POST');
  expect(response?.status).toBe(409);
  expect(await response?.json()).toMatchObject({ result: 'operator_stopped' });
  expect(core.status()[JOB]).toMatchObject({
    generation: 1,
    stopReason: 'operator',
    stopped: true,
  });
});

it('cannot stop a job or use another method', async () => {
  const { call, core } = setup();
  expect((await call(`/control/jobs/${JOB}/stop`, 'POST'))?.status).toBe(404);
  expect((await call(`/control/jobs/${JOB}/resume`, 'GET'))?.status).toBe(404);
  expect((await call('/control/jobs', 'POST'))?.status).toBe(404);
  expect(core.status()[JOB]).toBeUndefined();
});

it('keeps the operator routes unchanged beside the relay token', async () => {
  const { call, core } = setup();
  expect(
    (await call(`/control/jobs/${DISABLED}/stop`, 'POST', OPERATOR))?.status
  ).toBe(200);
  const resumed = await call(
    `/control/jobs/${DISABLED}/resume`,
    'POST',
    OPERATOR
  );
  expect(resumed?.status).toBe(200);
  expect(core.status()[DISABLED]).toMatchObject({
    generation: 2,
    stopped: false,
  });
});
