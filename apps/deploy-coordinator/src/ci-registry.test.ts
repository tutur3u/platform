import { describe, expect, it } from 'vitest';
import {
  CI_LIMITS,
  type CiOperation,
  type CiRegistrationInput,
  runCiOperation,
} from './ci-registry';
import { type CiStore, MemoryCiStore, SqlCiStore } from './ci-store';
import { meteredSql, nodeSql } from './test-support';

const T0 = Date.UTC(2026, 10, 26, 12);
const DAY = 24 * 60 * 60_000;

const sha = (n: number) => n.toString(16).padStart(40, '0');

function registration(n: number, workflows = 82): CiRegistrationInput {
  return {
    sha: sha(n),
    before: sha(n - 1),
    base: null,
    plan: Array.from({ length: workflows }, (_, index) => ({
      workflow: `workflow-${index}.yaml`,
      run: index % 3 === 0,
      reason: 'no changed path matches the push filter',
      closureKey: 'ab'.repeat(16),
    })),
    runId: 1_000 + n,
    runAttempt: 1,
    actor: 'github:pusher',
    logsUrl: `https://github.com/tutur3u/platform/actions/runs/${1_000 + n}/attempts/1`,
  };
}

function harness(store: CiStore) {
  const attempt = (operation: CiOperation, now: number) =>
    runCiOperation(store, (work) => work(), operation, now);
  const call = (operation: CiOperation, now: number): any => {
    const result = attempt(operation, now);
    if (!result.ok) throw new Error(result.code);
    return result.value;
  };
  return { attempt, call };
}

const STORES: Array<[string, () => CiStore]> = [
  ['memory', () => new MemoryCiStore()],
  ['sqlite', () => new SqlCiStore(nodeSql())],
];

describe.each(STORES)('CI registry (%s)', (_name, makeStore) => {
  it('registers once per SHA and answers a repeat with the stored record', () => {
    const { call } = harness(makeStore());
    const first = call({ op: 'register', input: registration(1) }, T0);
    expect(first.created).toBe(true);
    expect(first.registration.registeredAt).toBe(T0);
    const changed = { ...registration(1), base: sha(9) };
    const repeat = call({ op: 'register', input: changed }, T0 + 5);
    expect(repeat.created).toBe(false);
    expect(repeat.registration).toEqual(first.registration);
    expect(call({ op: 'status' }, T0 + 5).budget.used).toBe(1);
  });

  it('lists newest first within the limit and reads one SHA', () => {
    const { attempt, call } = harness(makeStore());
    for (let n = 1; n <= 5; n += 1)
      call({ op: 'register', input: registration(n) }, T0 + n);
    const listed = call({ op: 'list', limit: 3 }, T0 + 10).registrations;
    expect(listed.map((r: any) => r.sha)).toEqual([sha(5), sha(4), sha(3)]);
    expect(call({ op: 'get', sha: sha(2) }, T0 + 10).runId).toBe(1_002);
    const missing = attempt({ op: 'get', sha: sha(99) }, T0 + 10);
    expect(missing.ok || missing.code).toBe('NOT_FOUND');
  });

  it('keeps only the newest registrations', () => {
    const { call } = harness(makeStore());
    // Spread over days so the budget never binds.
    for (let n = 1; n <= CI_LIMITS.retain + 3; n += 1)
      call({ op: 'register', input: registration(n, 1) }, T0 + n * DAY);
    const status = call({ op: 'status' }, T0 + 1_000 * DAY);
    expect(status.registrations).toBe(CI_LIMITS.retain);
    const oldest = call(
      { op: 'list', limit: CI_LIMITS.maxListLimit },
      T0 + 1_000 * DAY
    ).registrations;
    expect(oldest[0].sha).toBe(sha(CI_LIMITS.retain + 3));
    expect(() => call({ op: 'get', sha: sha(3) }, T0)).toThrow('NOT_FOUND');
    expect(call({ op: 'get', sha: sha(4) }, T0).sha).toBe(sha(4));
  });

  it('stops durably and writes nothing while stopped', () => {
    const store = makeStore();
    const { attempt, call } = harness(store);
    call({ op: 'register', input: registration(1) }, T0);
    const stopped = call({ op: 'stop', actor: 'op', reason: 'drill' }, T0 + 1);
    expect(stopped).toMatchObject({ stopped: true, stopRevision: 1 });
    // Stopping again keeps the revision.
    expect(
      call({ op: 'stop', actor: 'op', reason: 'again' }, T0 + 2).stopRevision
    ).toBe(1);
    for (const n of [1, 2]) {
      const result = attempt(
        { op: 'register', input: registration(n) },
        T0 + 3
      );
      expect(result.ok || result.code).toBe('STOPPED');
    }
    expect(call({ op: 'status' }, T0 + 3)).toMatchObject({
      registrations: 1,
      budget: { used: 1, limit: CI_LIMITS.dailyBudget },
    });
    expect(call({ op: 'resume' }, T0 + 4).stopped).toBe(false);
    expect(
      call({ op: 'register', input: registration(2) }, T0 + 5).created
    ).toBe(true);
  });

  it('rejects registrations past the daily budget and resets at UTC midnight', () => {
    const { attempt, call } = harness(makeStore());
    for (let n = 1; n <= CI_LIMITS.dailyBudget; n += 1)
      call({ op: 'register', input: registration(n, 1) }, T0 + n);
    const over = attempt(
      { op: 'register', input: registration(9_999, 1) },
      T0 + 1_000
    );
    expect(over.ok || over.code).toBe('BUDGET_EXHAUSTED');
    // A repeat is answered from storage, and reads and stop stay available.
    expect(
      call({ op: 'register', input: registration(1, 1) }, T0 + 1_001).created
    ).toBe(false);
    expect(call({ op: 'status' }, T0 + 1_002).budget.used).toBe(
      CI_LIMITS.dailyBudget
    );
    expect(
      call({ op: 'stop', actor: 'op', reason: 'x' }, T0 + 1_003).stopped
    ).toBe(true);
    call({ op: 'resume' }, T0 + 1_004);
    expect(
      call({ op: 'register', input: registration(9_999, 1) }, T0 + DAY).created
    ).toBe(true);
  });
});

// Rows written per call, pinned. A change that moves these numbers updates
// the cost sections of apps/docs/build/devops/deployment-coordinator.mdx and
// coordinator-ci-orchestration.mdx.
describe('CI registry rows written per call', () => {
  // ci_registrations is WITHOUT ROWID keyed by sha with no secondary index;
  // ci_meta's integer key is the rowid; ci_budget is keyed by day.
  const WEIGHT = { ci_registrations: 1, ci_meta: 1, ci_budget: 1 };

  function metered() {
    const { sql, meter } = meteredSql(WEIGHT);
    const store = new SqlCiStore(sql);
    const run = (operation: CiOperation, now: number) => {
      const before = meter.rows;
      const result = runCiOperation(store, (work) => work(), operation, now);
      return { result, rows: meter.rows - before };
    };
    return run;
  }

  it('pins each call', () => {
    const run = metered();
    // budget 1, registration 1; nothing to prune
    expect(run({ op: 'register', input: registration(1) }, T0).rows).toBe(2);
    // A repeat, operator reads and a budget or stop rejection write nothing.
    expect(run({ op: 'register', input: registration(1) }, T0).rows).toBe(0);
    expect(run({ op: 'list', limit: 100 }, T0).rows).toBe(0);
    expect(run({ op: 'get', sha: sha(1) }, T0).rows).toBe(0);
    expect(run({ op: 'status' }, T0).rows).toBe(0);
    expect(run({ op: 'stop', actor: 'op', reason: 'x' }, T0).rows).toBe(1);
    const stopped = run({ op: 'register', input: registration(2) }, T0);
    expect(stopped.result.ok).toBe(false);
    expect(stopped.rows).toBe(0);
    expect(run({ op: 'resume' }, T0).rows).toBe(1);
    // The first counted call of a UTC day also replaces the budget row.
    expect(run({ op: 'register', input: registration(2) }, T0 + DAY).rows).toBe(
      3
    );
  });

  it('pins a registration at full retention and a budget rejection', () => {
    const run = metered();
    for (let n = 1; n <= CI_LIMITS.retain; n += 1)
      run({ op: 'register', input: registration(n, 1) }, T0 + n * DAY);
    // A new day's budget row replaces the previous one (2), registration 1,
    // the oldest registration pruned 1.
    const next = run(
      { op: 'register', input: registration(CI_LIMITS.retain + 1, 1) },
      T0 + (CI_LIMITS.retain + 1) * DAY + 1
    );
    expect(next.rows).toBe(1 + 1 + 1 + 1);

    const day = T0 + 2_000 * DAY;
    let rows = 0;
    for (let n = 1; n <= CI_LIMITS.dailyBudget; n += 1)
      rows += run(
        { op: 'register', input: registration(10_000 + n, 1) },
        day
      ).rows;
    // The day's first registration replaces the budget row (+1); every
    // registration at full retention writes 3.
    expect(rows).toBe(CI_LIMITS.dailyBudget * 3 + 1);
    const over = run({ op: 'register', input: registration(99_999, 1) }, day);
    expect(over.result.ok).toBe(false);
    expect(over.rows).toBe(0);
  });
});
