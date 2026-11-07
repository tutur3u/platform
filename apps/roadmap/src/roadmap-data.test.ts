import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deriveStage,
  emptyEvidence,
  isSnapshotStale,
  parseEvidence,
  parseEvidenceInputs,
  publicProducts,
  stages,
  type MigrationEvidence,
  type PullEvidence,
} from './migration-evidence.ts';
import {
  filterProducts,
  parseSnapshot,
  snapshot,
  stageCounts,
} from './roadmap-data.ts';
import en from '../messages/en.json' with { type: 'json' };
import vi from '../messages/vi.json' with { type: 'json' };
const at = '2026-11-07T12:00:00Z',
  head = 'a'.repeat(40),
  merged = 'b'.repeat(40);
function pull(): PullEvidence {
  return {
    url: 'https://github.com/tutur3u/platform/pull/1',
    scope: 'migration_completion',
    state: 'open',
    headSha: head,
    draft: false,
    review: 'APPROVED',
    reviewedHeadSha: head,
    observedAt: at,
    requiredChecks: ['test'],
    checks: [{ name: 'test', headSha: head, conclusion: 'SUCCESS' }],
    merge: null,
  };
}
function evidence(pr = pull()): MigrationEvidence {
  return { pr, production: null };
}
const stage = (e: MigrationEvidence, work = false, included = false) =>
  deriveStage(work, parseEvidence(e, 'mail'), at, included);
test('each lifecycle stage requires its own evidence; scaffolding is only work in progress', () => {
  assert.equal(stage(emptyEvidence), 'planned');
  assert.equal(stage(emptyEvidence, true), 'rolling_out');
  assert.equal(stage(evidence()), 'waiting_for_merge');
  const e = evidence({
    ...pull(),
    state: 'merged',
    merge: { sha: merged, at },
  });
  assert.equal(stage(e, true, true), 'waiting_for_production_sync');
  assert.equal(stage(e, true, false), 'rolling_out');
  e.production = {
    kind: 'production_readback',
    url: 'https://tuturuuu.com/mail/',
    receiptUrl: `https://github.com/tutur3u/platform/blob/${head}/evidence/mail.json`,
    deployedSha: merged,
    responseSha: merged,
    accepted: true,
    observedAt: at,
  };
  assert.equal(stage(e, true, true), 'live');
  e.production.accepted = false;
  assert.equal(stage(e, true, true), 'waiting_for_production_sync');
  e.production.accepted = true;
  e.production.observedAt = '2026-11-05T12:00:00Z';
  if (e.pr?.merge) e.pr.merge.at = '2026-11-04T12:00:00Z';
  assert.equal(stage(e, true, true), 'waiting_for_production_sync');
});
test('empty/skipped/unknown/stale/mismatched or unapproved evidence is never green', () => {
  const variants: PullEvidence[] = [
    { ...pull(), checks: [] },
    { ...pull(), requiredChecks: [] },
    { ...pull(), requiredChecks: ['missing'] },
    { ...pull(), draft: true },
    { ...pull(), review: 'REVIEW_REQUIRED' },
    { ...pull(), review: 'UNKNOWN' },
    { ...pull(), review: 'CHANGES_REQUESTED' },
    { ...pull(), reviewedHeadSha: merged },
    { ...pull(), observedAt: '2026-11-05T12:00:00Z' },
    { ...pull(), observedAt: '2026-11-08T12:00:00Z' },
    ...(['SKIPPED', 'PENDING', 'UNKNOWN', 'FAILURE'] as const).map(
      (conclusion) => ({
        ...pull(),
        checks: [{ name: 'test', headSha: head, conclusion }],
      })
    ),
    {
      ...pull(),
      checks: [{ name: 'test', headSha: merged, conclusion: 'SUCCESS' }],
    },
  ];
  for (const pr of variants)
    assert.notEqual(stage(evidence(pr)), 'waiting_for_merge');
  assert.equal(stage(evidence({ ...pull(), state: 'closed' })), 'planned');
});
test('unsupported live claims and unknown/private-shaped inputs fail closed', () => {
  const e = evidence({
    ...pull(),
    state: 'merged',
    merge: { sha: merged, at },
  });
  const production = {
    kind: 'production_readback',
    url: 'https://tuturuuu.com/mail/',
    receiptUrl: `https://github.com/tutur3u/platform/blob/${head}/proof.json`,
    deployedSha: merged,
    responseSha: merged,
    accepted: true,
    observedAt: at,
  };
  for (const delta of [
    { kind: 'build_success' },
    { responseSha: head },
    { deployedSha: head },
    { url: 'https://private.example/mail/' },
    { receiptUrl: 'https://github.com/tutur3u/platform/blob/main/proof.json' },
  ]) {
    assert.throws(() =>
      parseEvidence({ ...e, production: { ...production, ...delta } }, 'mail')
    );
  }
  assert.throws(() => parseEvidence({ pr: null, production }, 'mail'));
  assert.throws(() => parseEvidence({ ...e, reason: 'private' }, 'mail'));
  assert.throws(() =>
    parseEvidence(
      { pr: { ...pull(), headSha: 'bad' }, production: null },
      'mail'
    )
  );
  assert.throws(() =>
    parseEvidenceInputs({ schemaVersion: 1, apps: { private: emptyEvidence } })
  );
  assert.throws(() => parseEvidenceInputs({ schemaVersion: 2, apps: {} }));
  assert.deepEqual(
    parseEvidenceInputs({ schemaVersion: 1, apps: { mail: emptyEvidence } }),
    [{ id: 'mail', evidence: emptyEvidence }]
  );
});
test('public snapshot preserves allowlist, provenance, conservative stages and bilingual labels', () => {
  assert.deepEqual(snapshot.apps.map((app) => app.id).sort(), [
    ...publicProducts,
  ]);
  for (const app of snapshot.apps) {
    assert.equal(app.checkedAt, snapshot.checkedAt);
    assert.notEqual(app.stage, 'live');
    for (const entry of app.evidence)
      assert.ok(entry.url.includes(`/blob/${snapshot.sourceCommit}/`));
  }
  for (const value of stages)
    assert.ok(
      en[value] && vi[value] && en.summaries[value] && vi.summaries[value]
    );
  for (const id of ['calendar', 'meet'])
    assert.equal(
      snapshot.apps.find((app) => app.id === id)?.stage,
      'rolling_out'
    );
  assert.throws(() => parseSnapshot({ ...snapshot, unexpected: true }));
  const bad = structuredClone(snapshot);
  bad.apps[0].stage = 'live';
  assert.throws(() => parseSnapshot(bad), /supporting evidence/);
  bad.apps[0].stage = snapshot.apps[0].stage;
  bad.apps[0].evidence[0].url = 'https://private.example/';
  assert.throws(() => parseSnapshot(bad));
});
test('blocked remains orthogonal to every stage, search, filters and counts', () => {
  const app = snapshot.apps[0];
  const products = stages.flatMap((stage) =>
    [false, true].map((blocked) => ({ ...app, stage, blocked }))
  );
  for (const value of stages) {
    assert.equal(filterProducts(products, ' AI ', value).length, 2);
    assert.equal(filterProducts(products, ' AI ', value, true).length, 1);
  }
  assert.equal(filterProducts(products, '', 'all', true).length, stages.length);
  assert.equal(filterProducts(products, 'missing', 'all').length, 0);
  assert.deepEqual(
    stageCounts(products),
    stages.map((stage) => ({ stage, count: 2 }))
  );
  assert.equal(
    stageCounts(snapshot.apps).reduce((sum, item) => sum + item.count, 0),
    publicProducts.length
  );
});
test('freshness boundary is deterministic and invalid/future observations are stale', () => {
  assert.equal(isSnapshotStale(at, Date.parse(at) + 86_400_000), false);
  assert.equal(isSnapshotStale(at, Date.parse(at) + 86_400_001), true);
  assert.equal(isSnapshotStale(at, Date.parse(at) - 1), true);
  assert.equal(isSnapshotStale('bad', Date.parse(at)), true);
});
