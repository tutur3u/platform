// Contract between the Calendar provider-sync route's response envelope and
// this scheduler: account-level failures must never spend the job's failure
// budget, while a run that genuinely failed still does. The envelope builder
// is the real Calendar module the route returns.
import { expect, it, vi } from 'vite-plus/test';
import type { CalendarTokenOutcomeEntry } from '../../calendar/src/lib/calendar/oauth-token-health';
import {
  buildProviderSyncEnvelope,
  type WorkspaceDispatchResult,
} from '../../calendar/src/lib/calendar/provider-sync-envelope';
import { dispatchScheduledJobs } from './dispatch';
import { MAX_CONSECUTIVE_FAILURES } from './jobs';
import { LedgerCore, localLedger, memoryLedgerStore } from './ledger';

const JOB = 'calendar-provider-sync';
const QUARTER_HOUR = 15 * 60_000;
const T0 = Date.parse('2026-10-26T05:00:00.000Z');
const env = {
  CRON_CONTROL_ENABLED_JOBS: JOB,
  CRON_SECRET_INFRASTRUCTURE: 'test-cron-secret-value',
  INFRASTRUCTURE_ORIGIN: 'https://infrastructure.example.test',
};

// Runs the scheduler past its failure budget against a fixed route response.
async function runPastBudget(
  envelope: ReturnType<typeof buildProviderSyncEnvelope>
) {
  const { store } = memoryLedgerStore();
  const core = new LedgerCore(store);
  const ledger = localLedger(core);
  const fetchMock = vi.fn(async () =>
    Response.json(envelope.body, { status: envelope.status })
  );
  const deps = {
    fetch: fetchMock as unknown as typeof fetch,
    ledger: () => ledger,
    now: () => T0,
    sleep: async () => undefined,
  };
  const outcomes: unknown[] = [];
  for (let tick = 0; tick < MAX_CONSECUTIVE_FAILURES + 2; tick++)
    for (const report of await dispatchScheduledJobs(
      '*/15 * * * *',
      T0 + tick * QUARTER_HOUR,
      env,
      deps
    ))
      if ('outcome' in report) outcomes.push(report.outcome);
  return { outcomes, state: core.status()[JOB] };
}

function account(
  index: number,
  provider: 'google' | 'microsoft',
  outcome: CalendarTokenOutcomeEntry['outcome'],
  extra: Partial<CalendarTokenOutcomeEntry> = {}
): CalendarTokenOutcomeEntry {
  return {
    account: index.toString(16).padStart(16, '0'),
    provider,
    outcome,
    attempts: 1,
    ...extra,
  };
}

function workspace(
  index: number,
  overrides: Partial<WorkspaceDispatchResult> = {}
): WorkspaceDispatchResult {
  return {
    ws_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    success: true,
    completed: true,
    ...overrides,
  };
}

it('keeps running through repeated partial failures and breaker holds', async () => {
  const envelope = buildProviderSyncEnvelope(
    {
      processed: 2,
      deferred: 0,
      results: [workspace(1, { success: false, error: 'auth' }), workspace(2)],
    },
    [
      account(1, 'google', 'deactivated', { reason: 'google_invalid_grant' }),
      account(2, 'google', 'consensus_hold', {
        reason: 'google_invalid_grant',
      }),
      account(3, 'google', 'transient'),
      account(4, 'google', 'ok', { refreshed: true }),
    ]
  );
  const { outcomes, state } = await runPastBudget(envelope);
  expect(outcomes.every((outcome) => outcome === 'ok')).toBe(true);
  expect(state).toMatchObject({ stopped: false, consecutiveFailures: 0 });
});

it('keeps running when one tenant removed our app and no Microsoft account refreshed', async () => {
  const tenant = { reason: 'microsoft_unauthorized_client' as const };
  const envelope = buildProviderSyncEnvelope(
    {
      processed: 2,
      deferred: 0,
      results: [workspace(1, { success: false, error: 'auth' }), workspace(2)],
    },
    [
      account(1, 'microsoft', 'deactivated', tenant),
      account(2, 'microsoft', 'deactivated', tenant),
      account(3, 'microsoft', 'consensus_hold', tenant),
      account(4, 'microsoft', 'consensus_hold', tenant),
      account(5, 'microsoft', 'consensus_hold', tenant),
      account(6, 'google', 'ok', { refreshed: true }),
    ]
  );
  const { state } = await runPastBudget(envelope);
  expect(state).toMatchObject({ stopped: false, consecutiveFailures: 0 });
});

it('reads the maximum-size response as a completed run', async () => {
  const outcomes = Array.from({ length: 10 * 20 * 2 }, (_, index) =>
    account(index, index % 2 ? 'microsoft' : 'google', 'consensus_hold', {
      reason: 'microsoft_unauthorized_client',
      providerCode: 'unauthorized_client/AADSTS7000112/http_400',
      attempts: 3,
    })
  );
  const results = Array.from({ length: 10 }, (_, index) =>
    workspace(index, {
      success: false,
      error: 'Calendar sync deadline exceeded',
    })
  );
  const envelope = buildProviderSyncEnvelope(
    { processed: 10, deferred: 10_000, results },
    outcomes
  );
  const { outcomes: runs, state } = await runPastBudget(envelope);
  expect(runs.every((outcome) => outcome === 'ok')).toBe(true);
  expect(state).toMatchObject({ stopped: false });
});

it('still exhausts the budget when the OAuth client is broken for everyone', async () => {
  const envelope = buildProviderSyncEnvelope(
    {
      processed: 1,
      deferred: 0,
      results: [workspace(1, { success: false, error: 'configuration' })],
    },
    [1, 2, 3].map((index) => account(index, 'google', 'systemic'))
  );
  const { state } = await runPastBudget(envelope);
  expect(state).toMatchObject({
    stopped: true,
    stopReason: 'failure-budget-exhausted',
  });
});

it('still exhausts the budget when no workspace sync completes', async () => {
  const envelope = buildProviderSyncEnvelope(
    {
      processed: 2,
      deferred: 0,
      results: [
        workspace(1, { success: false, completed: false }),
        workspace(2, { success: false, completed: false }),
      ],
    },
    []
  );
  const { state } = await runPastBudget(envelope);
  expect(state).toMatchObject({ stopped: true });
});

it.each([1, 2])(
  'exhausts the budget when all %i evaluated accounts hit a broken client',
  async (count) => {
    const envelope = buildProviderSyncEnvelope(
      {
        processed: 1,
        deferred: 0,
        results: [workspace(1, { success: false, error: 'configuration' })],
      },
      Array.from({ length: count }, (_, index) =>
        account(index, 'google', 'systemic')
      )
    );
    const { state } = await runPastBudget(envelope);
    expect(state).toMatchObject({
      stopped: true,
      stopReason: 'failure-budget-exhausted',
    });
  }
);

it('keeps running when a small sample mixes a broken-client signal with other failures', async () => {
  const envelope = buildProviderSyncEnvelope(
    {
      processed: 1,
      deferred: 0,
      results: [workspace(1, { success: false, error: 'auth' })],
    },
    [
      account(1, 'google', 'systemic'),
      account(2, 'google', 'consensus_hold', {
        reason: 'google_invalid_grant',
      }),
      account(3, 'microsoft', 'transient'),
    ]
  );
  const { state } = await runPastBudget(envelope);
  expect(state).toMatchObject({ stopped: false, consecutiveFailures: 0 });
});
