import { createHash } from 'node:crypto';
import { verifyPublicSource } from './source-proof.ts';
import {
  encodePathSegment,
  githubSourceUrl,
  publicEvidenceUrl,
} from './public-evidence-url.ts';
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
  type ProductionEvidence,
} from './migration-evidence.ts';
import {
  filterProducts,
  parseSnapshot,
  snapshot,
  stageCounts,
  rowSummaryKey,
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
    provenanceUrl: 'https://api.github.com/repos/tutur3u/platform/pulls/1',
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
  return {
    source: { commit: head, appSubtree: 'c'.repeat(40) },
    pr,
    production: null,
  };
}
function productionFixture(): ProductionEvidence {
  return {
    kind: 'production_readback',
    scope: 'mail',
    url: 'https://tuturuuu.com/mail/',
    receiptUrl: `https://github.com/tutur3u/platform/blob/${head}/proof.json`,
    receiptSha256: 'd'.repeat(64),
    versionId: '11111111-1111-1111-1111-111111111111',
    equivalence: {
      kind: 'git_app_subtree',
      app: 'mail',
      sourceCommit: head,
      mergeCommit: merged,
      deployedCommit: merged,
      appSubtree: 'c'.repeat(40),
    },
    deployedSha: merged,
    responseSha: merged,
    accepted: true,
    observedAt: at,
  };
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
  e.production = productionFixture();
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
  const production = productionFixture();
  parseEvidence({ ...e, production }, 'mail');
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
    parseEvidenceInputs({ schemaVersion: 2, apps: { private: emptyEvidence } })
  );
  assert.throws(() => parseEvidenceInputs({ schemaVersion: 99, apps: {} }));
  assert.deepEqual(
    parseEvidenceInputs({ schemaVersion: 2, apps: { mail: emptyEvidence } }),
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
      assert.ok(
        entry.label === 'Migration PR' ||
          entry.url.includes(`/blob/${snapshot.sourceCommit}/`)
      );
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

test('all evidence URLs use canonical RFC3986 segments and the exact category host', () => {
  assert.equal(encodePathSegment('[locale]'), '%5Blocale%5D');
  assert.equal(encodePathSegment('(marketing)'), '%28marketing%29');
  const path = 'apps/web/src/app/[locale]/(marketing)/products/ai/page.tsx';
  const url = githubSourceUrl(head, path);
  assert.ok(url.includes('%5Blocale%5D/%28marketing%29'));
  assert.equal(
    decodeURIComponent(new URL(url).pathname.split(`/blob/${head}/`)[1]),
    path
  );
  assert.equal(publicEvidenceUrl(url, 'github.com').href, url);
  for (const app of snapshot.apps) {
    for (const entry of app.evidence) {
      const host =
        entry.label === 'Production readback' ? 'tuturuuu.com' : 'github.com';
      publicEvidenceUrl(entry.url, host);
      assert.doesNotMatch(entry.url, /[[\]()]/);
    }
  }
  for (const bad of [
    'https://github.com/tutur3u/platform/blob/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/apps/web/src/app/[locale%5D/%28marketing%29/products/ai/page.tsx',
    'https://github.com/tutur3u/platform/blob/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/apps/web/src/app/%5Blocale%5D/(marketing%29/products/ai/page.tsx',
    'https://github.com/tutur3u/platform/blob/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/apps/web/src/app/%5blocale%5D/%28marketing%29/products/ai/page.tsx',
    'https://github.com/tutur3u/platform/blob/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/apps/web/src/app/%ZZlocale%5D/%28marketing%29/products/ai/page.tsx',
    url.replace('https:', 'http:'),
    url.replace('github.com', 'github.com.evil.test'),
    url.replace('github.com', 'tuturuuu.com'),
    url.replace('https://', '//'),
    url + '?token=x',
    url + '#fragment',
    url.replace('/apps/', '/apps//'),
    url.replace('/apps/', '/%2Fapps/'),
    url.replace('/apps/', '/%5Capps/'),
  ])
    assert.throws(() => publicEvidenceUrl(bad, 'github.com'));
});

test('reviewable public merge inputs retain unknown metadata and no production claim', () => {
  for (const id of ['playground', 'shortener', 'roadmap']) {
    const app = snapshot.apps.find((app) => app.id === id);
    assert.ok(app);
    assert.equal(app.stage, 'waiting_for_production_sync');
    assert.equal(app.stageEvidence.pr?.review, 'UNKNOWN');
    assert.deepEqual(app.stageEvidence.pr?.checks, []);
    assert.equal(app.stageEvidence.production, null);
    assert.ok(
      app.productUrl.includes(
        `/blob/${snapshot.sourceCommit}/apps/${id}/src/routes/`
      )
    );
    assert.equal(app.evidence[0].label, 'Migration PR');
  }
});

test('cohort release needs exact app source, ancestry, receipt bytes, target and response', () => {
  const cohort = 'e'.repeat(40),
    subtree = 'c'.repeat(40);
  const original = evidence({
    ...pull(),
    state: 'merged',
    merge: { sha: merged, at },
  });
  original.production = productionFixture();
  original.production.scope = 'roadmap';
  original.production.url = 'https://roadmap.tuturuuu.com/roadmap/';
  original.production.equivalence.app = 'roadmap';
  original.production.equivalence.deployedCommit = cohort;
  original.production.deployedSha = cohort;
  original.production.responseSha = cohort;
  const {
    receiptUrl: _url,
    receiptSha256: _hash,
    ...attestation
  } = original.production;
  const receipt = Buffer.from(JSON.stringify(attestation));
  original.production.receiptSha256 = createHash('sha256')
    .update(receipt)
    .digest('hex');
  const e = parseEvidence(original, 'roadmap');
  const options = {
    id: 'roadmap' as const,
    evidence: e,
    sourceCommit: head,
    readSubtree: () => subtree,
    isAncestor: () => true,
    readReceipt: () => receipt,
  };
  verifyPublicSource(options);
  assert.equal(deriveStage(true, e, at, true), 'live');
  assert.equal(deriveStage(true, e, at, false), 'rolling_out');
  assert.equal(
    deriveStage(true, e, '2026-11-09T12:00:00Z', true),
    'waiting_for_production_sync'
  );
  assert.throws(
    () => verifyPublicSource({ ...options, isAncestor: () => false }),
    /ancestry/
  );
  assert.throws(
    () => verifyPublicSource({ ...options, readSubtree: () => head }),
    /source identity/
  );
  assert.throws(
    () =>
      verifyPublicSource({
        ...options,
        readSubtree: (commit) => (commit === cohort ? head : subtree),
      }),
    /equivalence/
  );
  assert.throws(
    () =>
      verifyPublicSource({
        ...options,
        readReceipt: () => {
          throw new Error('Missing public receipt');
        },
      }),
    /Missing public receipt/
  );
  assert.throws(
    () =>
      verifyPublicSource({ ...options, readReceipt: () => Buffer.from('{}') }),
    /receipt identity/
  );
  const wrongReceipt = Buffer.from(
    JSON.stringify({ ...attestation, accepted: false })
  );
  const wrongEvidence = structuredClone(original);
  if (wrongEvidence.production)
    wrongEvidence.production.receiptSha256 = createHash('sha256')
      .update(wrongReceipt)
      .digest('hex');
  assert.throws(
    () =>
      verifyPublicSource({
        ...options,
        evidence: parseEvidence(wrongEvidence, 'roadmap'),
        readReceipt: () => wrongReceipt,
      }),
    /content mismatch/
  );
  for (const delta of [
    { scope: 'shortener' },
    { kind: 'build_artifact' },
    { responseSha: head },
    { receiptSha256: 'unknown' },
    { url: 'https://tuturuuu.com/roadmap/' },
    { versionId: 'unknown' },
    { extra: true },
  ]) {
    assert.throws(() =>
      parseEvidence(
        { ...original, production: { ...original.production, ...delta } },
        'roadmap'
      )
    );
  }
  for (const delta of [
    { app: 'shortener' },
    { sourceCommit: merged },
    { mergeCommit: head },
    { deployedCommit: head },
    { appSubtree: head },
    { kind: 'approved' },
  ]) {
    assert.throws(() =>
      parseEvidence(
        {
          ...original,
          production: {
            ...original.production,
            equivalence: { ...original.production?.equivalence, ...delta },
          },
        },
        'roadmap'
      )
    );
  }
});

test('roadmap row explains the missing public receipt in both languages without changing evidence or stages', () => {
  const before = structuredClone(snapshot);
  const counts = stageCounts(snapshot.apps);
  const roadmap = snapshot.apps.find((app) => app.id === 'roadmap');
  assert.ok(roadmap);
  assert.equal(roadmap.stageEvidence.production, null);
  assert.equal(roadmap.stage, 'waiting_for_production_sync');
  assert.equal(
    en.summaries[rowSummaryKey(roadmap)],
    'Awaiting public production receipt'
  );
  assert.equal(
    vi.summaries[rowSummaryKey(roadmap)],
    'Chờ bằng chứng production công khai'
  );
  for (const app of snapshot.apps.filter((app) => app.id !== 'roadmap')) {
    assert.equal(rowSummaryKey(app), app.stage);
    assert.equal(en.summaries[rowSummaryKey(app)], en.summaries[app.stage]);
    assert.equal(vi.summaries[rowSummaryKey(app)], vi.summaries[app.stage]);
  }
  assert.deepEqual(snapshot, before);
  assert.deepEqual(stageCounts(snapshot.apps), counts);
  assert.deepEqual(
    filterProducts(snapshot.apps, '', 'waiting_for_production_sync'),
    before.apps.filter((app) => app.stage === 'waiting_for_production_sync')
  );
});

test('roadmap pending-receipt copy disappears when accepted production evidence derives live', () => {
  const roadmap = snapshot.apps.find((app) => app.id === 'roadmap');
  assert.ok(roadmap?.stageEvidence.source && roadmap.stageEvidence.pr?.merge);
  const source = roadmap.stageEvidence.source;
  const merge = roadmap.stageEvidence.pr.merge;
  const production = productionFixture();
  production.scope = 'roadmap';
  production.url = 'https://roadmap.tuturuuu.com/roadmap/';
  production.deployedSha = merge.sha;
  production.responseSha = merge.sha;
  production.observedAt = snapshot.checkedAt;
  production.equivalence = {
    kind: 'git_app_subtree',
    app: 'roadmap',
    sourceCommit: source.commit,
    mergeCommit: merge.sha,
    deployedCommit: merge.sha,
    appSubtree: source.appSubtree,
  };
  const stageEvidence = parseEvidence(
    { ...roadmap.stageEvidence, production },
    'roadmap'
  );
  const stage = deriveStage(
    roadmap.workInSource,
    stageEvidence,
    snapshot.checkedAt,
    roadmap.mergeIncluded
  );
  assert.equal(stage, 'live');
  const later = { ...roadmap, stageEvidence, stage };
  assert.equal(rowSummaryKey(later), 'live');
  assert.equal(en.summaries[rowSummaryKey(later)], en.summaries.live);
  assert.equal(vi.summaries[rowSummaryKey(later)], vi.summaries.live);
  assert.equal(
    rowSummaryKey({ ...roadmap, mergeIncluded: false }),
    'waiting_for_production_sync'
  );
});
