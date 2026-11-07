import { expect, it, vi } from 'vite-plus/test';
import { dispatchScheduledJobs } from './dispatch';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';

it('runs the bounded private tutoring processor only when enabled, once per slot', async () => {
  const ledger = new LedgerCore(memoryLedgerStore().store);
  const fetch = vi.fn(async () => Response.json({ sent: 1 }));
  const env = {
    SUPABASE_URL: 'https://database.example.test',
    SUPABASE_SECRET_KEY: 'fixture-only-service-key',
    CRON_CONTROL_ENABLED_JOBS: '',
  };
  const deps = {
    fetch,
    ledger: () => localLedger(ledger),
    now: () => Date.parse('2026-11-03T06:00:00Z'),
    sleep: async () => undefined,
  };
  const run = () => dispatchScheduledJobs('0 6 * * *', deps.now(), env, deps);
  expect(await run()).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
  env.CRON_CONTROL_ENABLED_JOBS = 'tutoring-content-rules';
  expect(await run()).toMatchObject([{ outcome: 'ok', detail: { sent: 1 } }]);
  expect(fetch).toHaveBeenCalledWith(
    new URL(
      'https://database.example.test/rest/v1/rpc/process_tutoring_content_rules'
    ),
    expect.objectContaining({
      body: '{"p_limit":1000}',
      headers: expect.objectContaining({ 'Content-Profile': 'private' }),
    })
  );
  expect(await run()).toMatchObject([
    { outcome: 'skipped', reason: 'duplicate' },
  ]);
  expect(fetch).toHaveBeenCalledTimes(1);
});
