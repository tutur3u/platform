const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { lintMigration, checkRepository } = require('./security-definer-guard');
const { assertReviewedBlocks } = require('./security-definer-blocks');
const verified = require('./security-definer-verified-findings.json');
const {
  REVIEWED_EXCEPTIONS,
  digestFinding,
} = require('./sql-grant-reviewed-exceptions');

for (const searchPath of [
  "SET search_path TO 'pg_catalog', 'pg_temp'",
  'SET search_path TO pg_catalog, pg_temp',
  "SET search_path = ''",
]) {
  test('recognizes a pinned path: ' + searchPath, () => {
    const sql = `CREATE FUNCTION public.probe() RETURNS void LANGUAGE plpgsql
      SECURITY DEFINER ${searchPath} AS $$ BEGIN RETURN; END $$;
      REVOKE ALL ON FUNCTION public.probe() FROM PUBLIC, anon;`;
    assert.deepEqual(lintMigration(sql), []);
  });
}
test('an SQL string body cannot pretend to be a search_path option', () => {
  const sql = `CREATE FUNCTION public.probe() RETURNS text LANGUAGE sql SECURITY DEFINER
    AS 'SELECT ''SET search_path TO pg_catalog''';
    REVOKE ALL ON FUNCTION public.probe() FROM PUBLIC, anon;`;
  assert.ok(
    lintMigration(sql).some((entry) => entry.rule === 'missing-search-path')
  );
});
test('verified findings remain separate from the historical debt inventory', () => {
  const historical = require('./security-definer-historical-blocks.json');
  assert.equal(verified.length, 10);
  for (const entry of verified) {
    assert.equal(entry.classification, 'verified false positive');
    assert.ok(!historical.some((old) => old.file === entry.file));
    assert.deepEqual(
      entry.effectiveRoles,
      entry.file.includes('030700')
        ? ['authenticated', 'service_role']
        : entry.file.includes('030500')
          ? []
          : ['service_role']
    );
    assert.throws(
      () =>
        assertReviewedBlocks(verified, [
          { ...entry, effectiveRoles: ['anon'] },
        ]),
      /grant roles changed/
    );
  }
});
test('each reviewed finance finding binds file, line, rule and all source bytes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verified-definers-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = [...new Set(verified.map((entry) => entry.file))];
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(
      path.resolve(__dirname, '../..', file),
      path.join(root, file)
    );
  }
  const run = (verifiedFindings = verified) =>
    checkRepository({
      root,
      files,
      baseline: [],
      historicalBlocks: [],
      reviewedBlocks: [],
      verifiedFindings,
    });
  assert.deepEqual(run(), []);
  assert.equal(run([]).length, 10);
  for (const entry of verified) {
    for (const changed of [
      { ...entry, file: 'copied.sql' },
      { ...entry, line: entry.line + 1 },
      { ...entry, rule: 'other' },
      { ...entry, sourceDigest: '0'.repeat(64) },
      { ...entry, digest: '0'.repeat(64) },
    ]) {
      assert.equal(
        run(verified.map((row) => (row === entry ? changed : row))).length,
        1
      );
    }
  }
  for (const file of files)
    fs.appendFileSync(path.join(root, file), '\n-- changed source\n');
  assert.equal(run().length, 14);
});

test('each SR-843 finding is covered by exactly one mechanism', (t) => {
  const exception = REVIEWED_EXCEPTIONS.find((entry) =>
    entry.id.startsWith('SR-843')
  );
  assert.equal(exception.findings.length, 4);
  // The definer guard defers to the grant guard's source-bound exception, so
  // no verified-finding record may cover the same file and line.
  for (const entry of verified)
    assert.ok(
      !REVIEWED_EXCEPTIONS.some(
        (reviewed) =>
          reviewed.file === entry.file &&
          reviewed.findings.some((finding) => finding.line === entry.line)
      ),
      `${entry.file}:${entry.line} is in both mechanisms`
    );
  for (const finding of exception.findings)
    assert.equal(
      finding.digest,
      digestFinding({
        rule: exception.rule,
        file: exception.file,
        line: finding.line,
        signature: finding.signature,
      })
    );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sr843-single-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.dirname(path.join(root, exception.file)), {
    recursive: true,
  });
  fs.copyFileSync(
    path.resolve(__dirname, '../..', exception.file),
    path.join(root, exception.file)
  );
  const run = () =>
    checkRepository({
      root,
      files: [exception.file],
      baseline: [],
      historicalBlocks: [],
      reviewedBlocks: [],
      verifiedFindings: verified,
    });
  assert.deepEqual(run(), []);
  fs.appendFileSync(path.join(root, exception.file), '\n-- changed source\n');
  assert.equal(run().length, 5);
});

test('reviewed finance exceptions cannot hide a later anonymous grant', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-later-grant-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = verified.find((entry) => entry.file.includes('040800')).file;
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.copyFileSync(
    path.resolve(__dirname, '../..', file),
    path.join(root, file)
  );
  fs.writeFileSync(
    path.join(root, 'later.sql'),
    'GRANT EXECUTE ON FUNCTION public.get_daily_invoice_totals(uuid,integer,uuid[],uuid[],date,date) TO anon;'
  );
  const findings = checkRepository({
    root,
    files: [file, 'later.sql'],
    baseline: [],
    historicalBlocks: [],
    reviewedBlocks: [],
    verifiedFindings: verified,
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, 'later.sql');
  assert.equal(findings[0].rule, 'public-execute');
});
