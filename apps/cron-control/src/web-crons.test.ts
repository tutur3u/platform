import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vite-plus/test';
import { WEB_CRON_PATHS } from '../../web/src/lib/cron/web-cron-fence';
import { dispatchScheduledJobs } from './dispatch';
import {
  CRON_JOBS,
  CRON_TRIGGERS,
  leaseMs,
  MAX_CONSECUTIVE_FAILURES,
  maxAttempts,
} from './jobs';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';
import { isWebJob, WEB_JOBS } from './web-gate';

const T0 = Date.parse('2026-10-28T00:00:00Z');
const jobs = CRON_JOBS.filter((job) => isWebJob(job.id));
const env = {
  CRON_CONTROL_ENABLED_JOBS: jobs.map((job) => job.id).join(','),
  CRON_SECRET_WEB: 'disposable-web-cron-token',
  WEB_ORIGIN: 'https://web.example.test',
};

it.each([
  ['web-notification-batches', 310_000],
  ['web-post-email-queue', 310_000],
  ['web-report-automation', 120_000],
  ['web-topic-announcements', 120_000],
  ['web-deadline-reminders', 120_000],
] as const)(
  'gives %s its processor timeout and completion margin',
  (id, timeoutMs) => {
    const job = jobs.find((entry) => entry.id === id);
    expect(job).toBeDefined();
    if (!job) throw new Error(`Missing web job: ${id}`);
    expect(job.timeoutMs).toBe(timeoutMs);
    expect(leaseMs(job)).toBe(timeoutMs + 30_000);
  }
);
function harness(respond: () => Response = () => Response.json({ ok: true })) {
  const { store, counts } = memoryLedgerStore();
  const send = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    respond()
  );
  const ledger = vi.fn(() => localLedger(new LedgerCore(store)));
  const deps = {
    fetch: send,
    ledger,
    now: () => T0,
    sleep: vi.fn(async () => undefined),
  };
  return { deps, send, counts, ledger };
}
it('preserves all five Vercel paths, schedules, methods and default-off selection', async () => {
  const vercel = JSON.parse(
    readFileSync(new URL('../../web/vercel.json', import.meta.url), 'utf8')
  );
  expect(
    jobs
      .map(({ path, cron }) => ({ path, schedule: cron }))
      .sort((a, b) => a.path.localeCompare(b.path))
  ).toEqual(
    vercel.crons.sort((a: { path: string }, b: { path: string }) =>
      a.path.localeCompare(b.path)
    )
  );
  expect(jobs).toHaveLength(5);
  for (const job of jobs) {
    expect(job.method).toBe('GET');
    expect(CRON_TRIGGERS).toContain(job.cron);
    expect(maxAttempts(job)).toBe(1);
    expect(
      Object.entries(WEB_CRON_PATHS).find(([path]) => path === job.path)?.[1]
    ).toEqual([
      job.id,
      Object.entries(WEB_JOBS).find(([id]) => id === job.id)?.[1],
    ]);
  }
  const config = readFileSync(
    new URL('../cloudflare.config.ts', import.meta.url),
    'utf8'
  );
  expect(config).toContain("CRON_CONTROL_WEB_MODE: bindings.text('off')");
  expect(config).not.toMatch(
    /CRON_CONTROL_ENABLED_JOBS: bindings.text\(\s*'[^']*web-/
  );
});
it('off and shadow modes spend no ledger or endpoint operations, even with enabled ids', async () => {
  for (const mode of [undefined, 'off', 'shadow', 'typo']) {
    const h = harness();
    for (const cron of new Set(jobs.map((job) => job.cron))) {
      const reports = await dispatchScheduledJobs(
        cron,
        T0,
        { ...env, CRON_CONTROL_WEB_MODE: mode },
        h.deps
      );
      expect(reports.length).toBeGreaterThan(0);
      expect(reports.every((report) => report.outcome === 'skipped')).toBe(
        true
      );
    }
    expect(h.send).not.toHaveBeenCalled();
    expect(h.ledger).not.toHaveBeenCalled();
  }
});
it.each(jobs)(
  'dispatches $id once per slot across restarts with a stable endpoint slot key',
  async (job) => {
    const h = harness();
    const enabled = {
      ...env,
      CRON_CONTROL_ENABLED_JOBS: job.id,
      CRON_CONTROL_WEB_MODE: 'active',
    };
    expect(
      (await dispatchScheduledJobs(job.cron, T0, enabled, h.deps))[0]
    ).toMatchObject({ attempts: 1, outcome: 'ok' });
    expect(
      (await dispatchScheduledJobs(job.cron, T0 + 10_000, enabled, h.deps))[0]
    ).toMatchObject({ outcome: 'skipped', reason: 'duplicate' });
    expect(h.send).toHaveBeenCalledOnce();
    const [, init] = h.send.mock.calls[0];
    expect(new Headers(init?.headers).get('x-tuturuuu-cron-slot')).toBe(
      String(T0)
    );
    expect(new Headers(init?.headers).get('authorization')).toBe(
      `Bearer ${env.CRON_SECRET_WEB}`
    );
    expect(init?.redirect).toBe('manual');
    expect(h.counts.writes).toBe(2);
  }
);
it.each(['gateway', 'lost-response'])(
  'bounds %s failures and durable failure-stop across restarts',
  async (failure) => {
    const h = harness(() => {
      if (failure === 'lost-response')
        throw new Error('response lost after possible commit');
      return new Response(null, { status: 503 });
    });
    const enabled = {
      ...env,
      CRON_CONTROL_ENABLED_JOBS: 'web-notification-batches',
      CRON_CONTROL_WEB_MODE: 'active',
    };
    for (let i = 0; i < 10; i++)
      await dispatchScheduledJobs(
        '*/15 * * * *',
        T0 + i * 900_000,
        enabled,
        h.deps
      );
    expect(h.send).toHaveBeenCalledTimes(MAX_CONSECUTIVE_FAILURES);
    expect(h.deps.sleep).not.toHaveBeenCalled();
    expect(h.counts.writes).toBe(MAX_CONSECUTIVE_FAILURES * 2);
  }
);
it('rechecks the durable stop before the first web HTTP attempt', async () => {
  const h = harness();
  const core = new LedgerCore(memoryLedgerStore().store);
  const ledger = localLedger(core);
  const claim = ledger.claim;
  ledger.claim = async (input) => {
    const result = await claim(input);
    core.stop(input.jobId, 'operator');
    return result;
  };
  h.deps.ledger = vi.fn(() => ledger);
  expect(
    (
      await dispatchScheduledJobs(
        '*/5 * * * *',
        T0,
        { ...env, CRON_CONTROL_WEB_MODE: 'active' },
        h.deps
      )
    )[0]
  ).toMatchObject({ attempts: 0, outcome: 'stopped' });
  expect(h.send).not.toHaveBeenCalled();
});
