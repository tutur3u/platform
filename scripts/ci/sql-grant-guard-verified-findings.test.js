const assert = require('node:assert/strict');
const test = require('node:test');
const {
  collectDiagnostics,
  evaluateSqlFiles,
} = require('./sql-grant-guard-baseline');
const file = 'apps/database/supabase/migrations/20300101000000_fixture.sql';
const fix = 'apps/database/supabase/migrations/20300101000001_harden.sql';
const sql =
  'create function public.f() returns int language sql security definer set search_path=public as $$select 1$$;';
const input = { files: [file], readFile: () => sql };
const finding = collectDiagnostics(input).find(
  (f) => f.rule === 'definer-search-path'
);
const entry = {
  path: file,
  line: finding.line,
  rule: finding.rule,
  fileDigest: finding.fileDigest,
  digest: finding.digest,
  reason: 'Verified review',
};
const pathFindings = (options) =>
  evaluateSqlFiles({
    ...input,
    verifiedFindings: [entry],
    ...options,
  }).violations.filter(
    (f) => f.file === file && f.rule === 'definer-search-path'
  );

test('verified findings bind path, line, rule, file bytes, finding and reason', () => {
  assert.deepEqual(pathFindings({}), []);
  for (const changed of [
    { path: file.replace('fixture', 'copied') },
    { line: entry.line + 1 },
    { rule: 'function-acl' },
    { fileDigest: '0'.repeat(64) },
    { digest: '0'.repeat(64) },
    { reason: '' },
    { class: 'unknown' },
  ])
    assert.equal(
      pathFindings({ verifiedFindings: [{ ...entry, ...changed }] }).length,
      1
    );
  assert.equal(
    pathFindings({ readFile: () => `${sql}\n-- changed` }).length,
    1
  );
});

test('fixed-forward finding requires the named hardening migration in the tree', () => {
  const fixed = { ...entry, class: 'fixed-forward', requiredMigration: fix };
  assert.deepEqual(
    pathFindings({ files: [file, fix], verifiedFindings: [fixed] }),
    []
  );
  assert.equal(pathFindings({ verifiedFindings: [fixed] }).length, 1);
  for (const requiredMigration of [undefined, file, '../harden.sql'])
    assert.equal(
      pathFindings({
        files: [file, fix],
        verifiedFindings: [{ ...fixed, requiredMigration }],
      }).length,
      1
    );
});

test('committed 100400 entries are inactive until the 030000 hardening file exists', () => {
  const fs = require('node:fs');
  const verifiedFindings = require('./sql-grant-guard-verified-findings');
  const hardening =
    'apps/database/supabase/migrations/20261030030000_pin_time_tracking_definer_search_path.sql';
  const bound = verifiedFindings.filter((e) =>
    e.path.includes('20261029100400')
  );
  assert.equal(bound.length, 8);
  for (const e of bound) {
    assert.equal(e.class, 'fixed-forward');
    assert.equal(e.requiredMigration, hardening);
    assert.match(e.reason, /^fixed forward by 20261030030000_pin_time/);
  }
  const files = [
    ...new Set(
      verifiedFindings.flatMap((e) =>
        [e.path, e.requiredMigration].filter(Boolean)
      )
    ),
  ].filter((f) => f !== hardening);
  const readFile = (f) => fs.readFileSync(f, 'utf8');
  const run = (list) =>
    evaluateSqlFiles({ files: list, readFile, verifiedFindings });
  const failing = (list) =>
    run(list).violations.filter((f) => f.file.includes('20261029100400'));
  assert.equal(failing(files).length, bound.length);
  const present = run([...files, hardening]);
  assert.deepEqual(
    present.violations.filter((f) => f.file.includes('20261029100400')),
    []
  );
  assert.equal(present.verified.length, verifiedFindings.length);
});

test('rollback records admit only source-bound rollback search-path diagnostics', () => {
  const rollback =
    'apps/database/rollbacks/20300101000000_fixture.rollback.sql';
  const files = [rollback];
  const readFile = () => sql;
  const diagnostics = collectDiagnostics({ files, readFile });
  const records = diagnostics.map((f) => ({
    path: f.file,
    line: f.line,
    rule: f.rule,
    fileDigest: f.fileDigest,
    digest: f.digest,
    class: 'rollback',
    reason: 'Restore the prior body with forward fix ready',
  }));
  const run = (options = {}) =>
    evaluateSqlFiles({
      files,
      readFile,
      verifiedFindings: records,
      ...options,
    });
  assert.deepEqual(
    run().verified.map((f) => f.rule),
    ['definer-search-path']
  );
  assert.ok(run().violations.some((f) => f.rule === 'function-acl'));
  assert.equal(
    run({ readFile: () => `${sql}\n-- changed` }).verified.length,
    0
  );
  assert.equal(
    pathFindings({ verifiedFindings: [{ ...entry, class: 'rollback' }] })
      .length,
    1
  );
});

test('committed O5 records require the reviewed final hardening supplier', () => {
  const fs = require('node:fs');
  const verifiedFindings = require('./sql-grant-guard-verified-findings');
  const historical =
    'apps/database/supabase/migrations/20261109180000_guard_legacy_cross_app_token_uuid.sql';
  const hardening =
    'apps/database/supabase/migrations/20261109190001_harden_legacy_cross_app_token_contract.sql';
  const bound = verifiedFindings.filter((e) => e.path === historical);
  assert.equal(bound.length, 3);
  assert.deepEqual(bound.map((e) => e.rule).sort(), [
    'definer-public',
    'definer-search-path',
    'function-acl',
  ]);
  for (const e of bound) {
    assert.equal(e.line, 1);
    assert.equal(
      e.fileDigest,
      '519ceb35caf61da65898895fb208cbf1e3b115a3d91263fdd9d671a331fbbc31'
    );
    assert.equal(
      e.digest,
      '8e56a8c131891176f26c3a880d3090cbef8212269a5694ca0c38016a8d5b1ad4'
    );
    assert.equal(e.class, 'fixed-forward');
    assert.equal(e.requiredMigration, hardening);
    assert.ok(e.reason.includes(hardening));
  }
  const files = [
    ...new Set(
      verifiedFindings.flatMap((e) =>
        [e.path, e.requiredMigration].filter(Boolean)
      )
    ),
  ];
  const run = (list) =>
    evaluateSqlFiles({
      files: list,
      readFile: (f) => fs.readFileSync(f, 'utf8'),
      verifiedFindings,
    });
  const present = run(files);
  assert.deepEqual(
    present.violations.filter((f) => f.file === historical),
    []
  );
  assert.equal(present.verified.length, verifiedFindings.length);
  const missing = run(files.filter((f) => f !== hardening));
  assert.deepEqual(
    missing.violations
      .filter((f) => f.file === historical)
      .map((f) => f.rule)
      .sort(),
    bound.map((e) => e.rule).sort()
  );
  assert.equal(missing.verified.length, verifiedFindings.length - bound.length);
});
