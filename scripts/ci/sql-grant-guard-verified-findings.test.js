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
    pathFindings({ readFile: () => sql + '\n-- changed' }).length,
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
