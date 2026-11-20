import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { LIMITS } from './core';
import { type Operation, runOperation } from './environment-service';
import type { EnvironmentName } from './projects';
import { type SqlExec, SqlEnvironmentStore } from './sql-store';

// Cloudflare bills every row a write touches in a table and in each of its
// indexes. Each table's weight is one plus the indexes the schema in
// sql-store.ts creates on it; every changed row is counted at full weight,
// whether or not the write moved an indexed column.
const WEIGHT: Record<string, number> = {
  // id primary key, idempotency_key unique, (lane, seq), (status, created_at)
  deployments: 5,
  // lane primary key
  lanes: 2,
  // integer primary key is the rowid
  meta: 1,
  // day primary key
  budget: 2,
};

function meteredSql() {
  const db = new DatabaseSync(':memory:');
  const meter = { rows: 0 };
  const sql: SqlExec = {
    exec(query, ...bindings) {
      const statement = db.prepare(query);
      const params = bindings as Array<string | number | null>;
      const table = /^\s*(?:INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/i.exec(
        query
      )?.[1];
      let rows: never[] = [];
      if (statement.columns().length > 0) {
        rows = statement.all(...params) as never[];
        if (table) meter.rows += rows.length * (WEIGHT[table] ?? 1);
      } else {
        const { changes } = statement.run(...params);
        if (table) meter.rows += Number(changes) * (WEIGHT[table] ?? 1);
      }
      return {
        toArray: () => rows,
        one: () => {
          if (rows.length !== 1) throw new Error('Expected exactly one row');
          return rows[0]!;
        },
      };
    },
  };
  return { sql, meter };
}

const T0 = Date.UTC(2026, 10, 20, 12);

function metered(environment: EnvironmentName = 'production') {
  const { sql, meter } = meteredSql();
  const store = new SqlEnvironmentStore(sql);
  let counter = 0;
  const newId = () =>
    `00000000-0000-4000-8000-${(++counter).toString().padStart(12, '0')}`;
  // Returns the operation's result and the rows it wrote.
  const run = (operation: Operation, now: number) => {
    const before = meter.rows;
    const result = runOperation(
      store,
      (work) => work(),
      { project: 'calendar', environment },
      operation,
      now,
      newId
    );
    if (!result.ok) throw new Error(result.code);
    return { value: result.value as any, rows: meter.rows - before };
  };
  const create = (runId: number, now: number, lane = 'default') =>
    run(
      {
        op: 'create',
        input: {
          project: 'calendar',
          environment,
          lane,
          kind: 'deploy',
          sha: runId.toString(16).padStart(40, '0'),
          ref: 'refs/heads/production',
          plan: null,
          sourceDeploymentId: null,
          artifact: null,
          logsUrl: null,
          actor: 'github:ci',
          runId,
          idempotencyKey: `ci:${runId}:1:${lane}`,
          bodyDigest: `digest-${runId}`,
        },
      },
      now
    );
  return { run, create, meter };
}

// Rows written per call, pinned. A change to the schema or the state machine
// that moves these numbers must update the cost ceiling in
// apps/docs/build/devops/deployment-coordinator.mdx.
describe('rows written per call', () => {
  it('pins the direct cost of each CI call', () => {
    const m = metered();
    const first = m.create(100, T0);
    // budget 2, sequence 1 (2 when the meta row is first written), lane 2,
    // deployment 5
    expect(first.rows).toBe(11);
    const id = first.value.deployment.id;

    const claim = m.run({ op: 'claim', id, workerId: 'w', runId: 100 }, T0);
    expect(claim.rows).toBe(9);
    const grant = claim.value.grant;

    const second = m.create(101, T0 + 1);
    expect(second.rows).toBe(10);
    const waiting = m.run(
      {
        op: 'claim',
        id: second.value.deployment.id,
        workerId: 'w',
        runId: 101,
      },
      T0 + 2
    );
    expect(waiting.value.decision).toBe('wait');
    expect(waiting.rows).toBe(2);

    const beat = m.run({ op: 'heartbeat', id, grant, runId: 100 }, T0 + 3);
    expect(beat.rows).toBe(7);

    const done = m.run(
      {
        op: 'complete',
        id,
        runId: 100,
        input: {
          grant,
          outcome: 'succeeded',
          url: null,
          artifact: null,
          failureReason: null,
        },
      },
      T0 + 4
    );
    expect(done.rows).toBe(9);

    // Operator reads, stop and resume are not counted against the budget.
    expect(m.run({ op: 'snapshot' }, T0 + 5).rows).toBe(0);
    expect(m.run({ op: 'get', id }, T0 + 5).rows).toBe(0);
    expect(m.run({ op: 'stop', actor: 'op', reason: 'x' }, T0 + 5).rows).toBe(
      1
    );
  });

  it('pins resolving a marker', () => {
    const m = metered();
    const publish = (runId: number, now: number) => {
      const id = m.create(runId, now).value.deployment.id;
      const { grant } = m.run(
        { op: 'claim', id, workerId: 'w', runId },
        now
      ).value;
      m.run(
        {
          op: 'complete',
          id,
          runId,
          input: {
            grant,
            outcome: 'succeeded',
            url: null,
            artifact: null,
            failureReason: null,
          },
        },
        now
      );
      return id;
    };
    const good = publish(100, T0);
    publish(101, T0 + 1);
    const marker = m.run({ op: 'rollback', id: good, actor: 'op' }, T0 + 2)
      .value.deployment;
    // budget 2, lane epoch 2, then the terminal transition: lane 2 and
    // deployment 5, charged to the marker's create in the ceiling.
    const resolved = m.run(
      {
        op: 'resolve',
        id: marker.id,
        outcome: 'succeeded',
        actor: 'op',
        url: null,
      },
      T0 + 3
    );
    expect(resolved.rows).toBe(11);
  });

  it('replaces the budget row on the first call of a UTC day', () => {
    const m = metered();
    m.create(100, T0);
    const tomorrow = T0 + 24 * 60 * 60_000;
    const claim = m.run(
      {
        op: 'claim',
        id: '00000000-0000-4000-8000-000000000001',
        workerId: 'w',
        runId: 100,
      },
      tomorrow
    );
    // Yesterday's counter is deleted (2) and today's inserted (2), on top of
    // the claim's own writes.
    expect(claim.rows).toBe(4 + 7);
  });

  it('pins a create that supersedes and prunes at full retention', () => {
    const m = metered();
    for (let run = 1; run <= LIMITS.retainPerLane + 1; run += 1)
      m.create(run, T0 + run);
    // The newest create supersedes the one queued deploy (finish: lane 2,
    // deployment 5) and prunes the oldest finished row past retention (5).
    const next = m.create(LIMITS.retainPerLane + 2, T0 + 1_000);
    expect(next.rows).toBe(10 + 7 + 5);
  });

  it('bounds the amortized rows of a worst-case deployment lifecycle', () => {
    const m = metered();
    const start = m.meter.rows;
    let calls = 0;
    const call = (operation: Operation, now: number) => {
      calls += 1;
      return m.run(operation, now).value;
    };
    // An earlier run holds the lane, so this one polls for its full window.
    calls += 1;
    const other = m.create(99, T0).value.deployment.id;
    const held = call({ op: 'claim', id: other, workerId: 'a', runId: 99 }, T0);
    calls += 1;
    const id = m.create(100, T0).value.deployment.id;
    for (let poll = 0; poll < 90; poll += 1)
      expect(
        call({ op: 'claim', id, workerId: 'w', runId: 100 }, T0 + poll).decision
      ).toBe('wait');
    call(
      {
        op: 'complete',
        id: other,
        runId: 99,
        input: {
          grant: held.grant,
          outcome: 'succeeded',
          url: null,
          artifact: null,
          failureReason: null,
        },
      },
      T0 + 95
    );
    const { grant } = call(
      { op: 'claim', id, workerId: 'w', runId: 100 },
      T0 + 96
    );
    for (let beat = 0; beat < 90; beat += 1)
      call({ op: 'heartbeat', id, grant, runId: 100 }, T0 + 97 + beat);
    call(
      {
        op: 'complete',
        id,
        runId: 100,
        input: {
          grant,
          outcome: 'succeeded',
          url: null,
          artifact: null,
          failureReason: null,
        },
      },
      T0 + 200
    );
    const perCall = (m.meter.rows - start) / calls;
    expect(perCall).toBeLessThan(5);
  });
});
