import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import {
  type Authority,
  type AuthoritySnapshot,
  contextKindSchema,
  type DueJob,
} from './contracts';
import { DueJobEngine } from './engine';
import {
  type ContextEvidence,
  evidenceSchema,
  PlanReviewEngine,
} from './review';
import { SqliteJobStore, SqliteReviewStore } from './sqlite-store';

const at = Date.UTC(2026, 9, 12, 12);
const actorId = 'c1121e22-ace1-4123-8f77-593f201abc11';
const workspaceId = 'c1121e22-ace1-4123-8f77-593f201abc12';
const sourceId = 'c1121e22-ace1-4123-8f77-593f201abc13';
const job: DueJob = {
  actorId,
  workspaceId,
  occurrenceId: 'daily-1',
  dueAt: at,
  expiresAt: at + 60_000,
  sourceVersion: '1',
  consentVersion: '1',
  action: 'reflection-dry-run',
};
function reference(kind: ContextEvidence['kind'] = 'journal'): ContextEvidence {
  const fields = {
    actorId,
    personalWorkspaceId: workspaceId,
    sourceId,
    observedAt: new Date(at).toISOString(),
    expiresAt: new Date(at + 5_000).toISOString(),
    deletionVersion: 1,
    revocationVersion: 1,
    consentVersion: 1,
  };
  return kind === 'journal'
    ? { ...fields, kind, sourceRevision: 1 }
    : { ...fields, kind, sourceRevision: 'opaque-1' };
}
function fixture() {
  const db = new DatabaseSync(':memory:');
  const sql = {
    exec(query: string, ...values: (string | number | null)[]) {
      const rows = db.prepare(query).all(...values);
      return { toArray: () => rows };
    },
  };
  const atomic = <T>(operation: () => T): T => {
    db.exec('BEGIN');
    try {
      const result = operation();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const jobs = new SqliteJobStore(sql, atomic);
  const reviews = new SqliteReviewStore(sql, atomic);
  let now = at;
  const snapshot: Extract<AuthoritySnapshot, { kind: 'qualified' }> = {
    kind: 'qualified',
    checkedAt: now,
    validUntil: now + 5_000,
    paid: true,
    consent: {
      actorId,
      workspaceId,
      creatorId: actorId,
      personal: true,
      enabled: true,
      paused: false,
      version: '1',
      sourceVersion: '1',
      timezone: 'UTC',
      cadenceMs: 86_400_000,
      previousDueAt: null,
      quietHours: null,
      maxRuns: 1,
      remainingUnits: 1,
    },
    context: {
      qualified: true,
      permissionVersion: 'permission-1',
      canResearch: true,
      canPlan: true,
      canDryRun: true,
      allowedSources: [
        'journal',
        'memory',
        'goals',
        'task',
        'calendar',
        'notifications',
      ],
      evidence: [reference()],
    },
  };
  const authority: Authority = {
    async read() {
      return structuredClone(snapshot);
    },
  };
  const due = new DueJobEngine(
    jobs,
    authority,
    () => now,
    () => 'lease'
  );
  const engine = new PlanReviewEngine(jobs, reviews, authority, () => now);
  return {
    db,
    sql,
    atomic,
    jobs,
    reviews,
    snapshot,
    due,
    engine,
    authority,
    time(value: number) {
      now = value;
    },
    async ready() {
      await due.submit(job);
      await due.execute();
      return engine.prepare(job);
    },
  };
}
it('synthetic complete due/context/plan/selected approval/dry-run/activity loop is durable and idempotent', async () => {
  const f = fixture();
  try {
    f.snapshot.context.evidence = [
      'journal',
      'memory',
      'goals',
      'task',
      'calendar',
      'notifications',
    ].map((kind) => reference(contextKindSchema.parse(kind)));
    const plan = await f.ready();
    expect(plan.kind).toBe('state');
    expect(f.reviews.read()?.kind).toBe('plan');
    expect(await f.engine.execute(job)).toEqual({
      kind: 'denied',
      reason: 'selected-approval-required',
    });
    await f.engine.approve(job, {
      revision: 1,
      selectedAction: 'record-dry-run',
      expiresAt: at + 4000,
    });
    await f.engine.execute(job);
    const completed = f.reviews.read();
    expect(completed?.kind).toBe('completed');
    if (completed?.kind !== 'completed') throw new Error('missing receipt');
    expect(completed.providerCalled).toBe(false);
    expect(completed.plan.evidence).toHaveLength(6);
    const recovered = new PlanReviewEngine(
      new SqliteJobStore(f.sql, f.atomic),
      new SqliteReviewStore(f.sql, f.atomic),
      f.authority,
      () => at
    );
    expect(await recovered.execute(job)).toEqual({
      kind: 'state',
      state: completed,
    });
    expect(f.reviews.read()).toEqual(completed);
    expect(f.jobs.read()?.runs).toBe(1);
  } finally {
    f.db.close();
  }
});
it('reject/correct/revise is bounded, invalidates old approvals, and never creates an idle timer', async () => {
  const f = fixture();
  try {
    await f.ready();
    f.engine.reject(job, 1, 'wrong-context');
    expect(f.reviews.read()?.kind).toBe('rejected');
    f.snapshot.context.evidence = [
      { ...reference('journal'), kind: 'journal', sourceRevision: 2 },
    ];
    await f.engine.revise(job);
    expect(
      await f.engine.approve(job, {
        revision: 1,
        selectedAction: 'record-dry-run',
        expiresAt: at + 1000,
      })
    ).toEqual({ kind: 'denied', reason: 'approval-scope-invalid' });
    f.engine.reject(job, 2, 'irrelevant');
    await f.engine.revise(job);
    f.engine.reject(job, 3, 'wrong-timing');
    expect(await f.engine.revise(job)).toEqual({
      kind: 'denied',
      reason: 'revision-budget-exhausted',
    });
    expect(f.jobs.read()?.runs).toBe(1);
  } finally {
    f.db.close();
  }
});
for (const field of [
  'sourceRevision',
  'deletionVersion',
  'revocationVersion',
  'consentVersion',
] satisfies (keyof Pick<
  ContextEvidence,
  'sourceRevision' | 'deletionVersion' | 'revocationVersion' | 'consentVersion'
>)[]) {
  it(`fresh ${field} prevents stale approved action`, async () => {
    const f = fixture();
    try {
      await f.ready();
      await f.engine.approve(job, {
        revision: 1,
        selectedAction: 'record-dry-run',
        expiresAt: at + 4000,
      });
      const base = reference('journal');
      if (base.kind !== 'journal') throw new Error('fixture');
      f.snapshot.context.evidence = [{ ...base, [field]: 2 }];
      await f.engine.execute(job);
      expect(f.reviews.read()?.kind).toBe('revoked');
      expect(await f.engine.execute(job)).toEqual({
        kind: 'denied',
        reason: 'selected-approval-required',
      });
    } finally {
      f.db.close();
    }
  });
}
it('forget invalidation wins against an in-flight approval and survives stale snapshot reuse', async () => {
  const f = fixture();
  try {
    await f.ready();
    let release: (value: AuthoritySnapshot) => void = () => {
      throw new Error('not ready');
    };
    const authority: Authority = {
      read: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    };
    const engine = new PlanReviewEngine(f.jobs, f.reviews, authority, () => at);
    const approving = engine.approve(job, {
      revision: 1,
      selectedAction: 'record-dry-run',
      expiresAt: at + 4000,
    });
    engine.invalidate(job, 'source-forgotten');
    release(f.snapshot);
    expect(await approving).toEqual({ kind: 'denied', reason: 'plan-changed' });
    await f.engine.prepare(job);
    expect(f.reviews.read()).toEqual({
      kind: 'revoked',
      reason: 'source-forgotten',
    });
  } finally {
    f.db.close();
  }
});
it('scope, expiry, permission, pause and budget failures deny selected execution', async () => {
  for (const change of [
    'scope',
    'expiry',
    'permission',
    'pause',
    'budget',
    'disabled',
    'unqualified',
  ]) {
    const f = fixture();
    try {
      await f.ready();
      await f.engine.approve(job, {
        revision: 1,
        selectedAction: 'record-dry-run',
        expiresAt: at + 4000,
      });
      if (change === 'scope')
        f.snapshot.context.evidence = [
          { ...reference(), personalWorkspaceId: sourceId },
        ];
      if (change === 'expiry') f.time(at + 4000);
      if (change === 'permission')
        f.snapshot.context.permissionVersion = 'permission-2';
      if (change === 'pause') f.snapshot.consent.paused = true;
      if (change === 'budget') f.snapshot.consent.remainingUnits = 0;
      if (change === 'disabled') f.snapshot.consent.enabled = false;
      if (change === 'unqualified') f.snapshot.context.qualified = false;
      await f.engine.execute(job);
      expect(f.reviews.read()?.kind).toBe('revoked');
    } finally {
      f.db.close();
    }
  }
});
it('requires authoritative strict metadata without body, mood or fabricated missing versions', () => {
  const good = reference();
  expect(evidenceSchema.parse(good)).toEqual(good);
  const { deletionVersion: _version, ...missing } = good;
  expect(evidenceSchema.safeParse(missing).success).toBe(false);
  expect(evidenceSchema.safeParse({ ...good, body: 'private' }).success).toBe(
    false
  );
  expect(evidenceSchema.safeParse({ ...good, sourceRevision: 0 }).success).toBe(
    false
  );
  expect(
    evidenceSchema.safeParse({
      ...good,
      observedAt: '2026-10-12T12:00:00+07:00',
    }).success
  ).toBe(false);
  expect(
    evidenceSchema.safeParse({ ...good, expiresAt: good.observedAt }).success
  ).toBe(false);
});

it('a failed plan authority read is durable, inspectable and never silently lost', async () => {
  const f = fixture();
  try {
    await f.due.submit(job);
    await f.due.execute();
    const failed = new PlanReviewEngine(
      f.jobs,
      f.reviews,
      {
        async read() {
          throw new Error('offline');
        },
      },
      () => at
    );
    expect(await failed.prepare(job)).toEqual({
      kind: 'state',
      state: { kind: 'blocked', reason: 'authority-unavailable' },
    });
    const recovered = new PlanReviewEngine(
      f.jobs,
      new SqliteReviewStore(f.sql, f.atomic),
      f.authority,
      () => at
    );
    expect(await recovered.prepare(job)).toEqual({
      kind: 'state',
      state: { kind: 'blocked', reason: 'authority-unavailable' },
    });
    expect(await recovered.execute(job)).toEqual({
      kind: 'denied',
      reason: 'selected-approval-required',
    });
    expect(f.jobs.read()?.runs).toBe(1);
  } finally {
    f.db.close();
  }
});

it('preserves opaque memory revisions and rejects numeric memory coercion', () => {
  const memory = reference('memory');
  expect(evidenceSchema.parse(memory).sourceRevision).toBe('opaque-1');
  expect(
    evidenceSchema.safeParse({ ...memory, sourceRevision: 1 }).success
  ).toBe(false);
  expect(
    evidenceSchema.safeParse({ ...reference('journal'), sourceRevision: '1' })
      .success
  ).toBe(false);
});
