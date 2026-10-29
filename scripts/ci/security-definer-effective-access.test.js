const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { checkRepository } = require('./security-definer-guard');
const earlier = `CREATE FUNCTION public.probe(id uuid) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ BEGIN RETURN; END $$;
REVOKE ALL ON FUNCTION public.probe(uuid) FROM PUBLIC, anon;`;
function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'effective-acl-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const contents = { 'a.sql': earlier, ...files };
  for (const [file, sql] of Object.entries(contents))
    fs.writeFileSync(path.join(root, file), sql);
  return {
    root,
    check: (baseline = []) =>
      checkRepository({
        root,
        files: Object.keys(contents).reverse(),
        baseline,
      }),
  };
}
for (const body of [
  "EXECUTE 'GR' || 'ANT EXECUTE ON FUNCTION public.probe(uuid) TO PUBLIC';",
  "EXECUTE 'GR' /* join */ || $q$ANT EXECUTE ON FUNCTION public.probe(uuid) TO PUBLIC$q$;",
  'EXECUTE command;',
  "EXECUTE format('SELECT %I', column_name);",
  "EXECUTE decode(encoded_sql, 'base64');",
]) {
  test(`unresolved dynamic SQL requires review: ${body}`, (t) => {
    const { check } = fixture(t, {
      'b.sql': `DO $acl$ BEGIN ${body} END $acl$;`,
    });
    const findings = check();
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, 'dynamic-execute-acl');
    assert.match(findings[0].message, /manual review required/);
    assert.match(findings[0].blockDigest, /^[a-f0-9]{64}$/);
  });
}
for (const statements of [
  'GRANT bridge TO anon;',
  'GRANT bridge TO intermediate; GRANT intermediate TO anon;',
  'GRANT bridge TO anon WITH INHERIT TRUE;',
]) {
  test(`membership exposes earlier role EXECUTE: ${statements}`, (t) => {
    const { check } = fixture(t, {
      'b.sql': 'GRANT EXECUTE ON FUNCTION public.probe(uuid) TO bridge;',
      'c.sql': statements,
    });
    const findings = check();
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'c.sql');
    assert.equal(findings[0].rule, 'public-execute');
    assert.match(findings[0].message, /inherited/);
  });
}
test('membership before the EXECUTE grant is also checked', (t) => {
  const { check } = fixture(t, {
    'b.sql': 'GRANT bridge TO anon;',
    'c.sql': 'GRANT EXECUTE ON FUNCTION public.probe(uuid) TO bridge;',
  });
  assert.equal(check()[0].file, 'c.sql');
});
for (const revoke of [
  'REVOKE bridge FROM anon;',
  'REVOKE EXECUTE ON FUNCTION public.probe(uuid) FROM bridge;',
]) {
  test(`revoked membership or EXECUTE prevents inherited access: ${revoke}`, (t) => {
    const { check } = fixture(t, {
      'b.sql': `GRANT EXECUTE ON FUNCTION public.probe(uuid) TO bridge; GRANT bridge TO anon; ${revoke}`,
    });
    assert.deepEqual(check(), []);
  });
}
test('a transitive membership revoke breaks the path across migrations', (t) => {
  const { check } = fixture(t, {
    'b.sql': 'GRANT bridge TO middle; GRANT middle TO anon;',
    'c.sql':
      'REVOKE middle FROM anon; GRANT EXECUTE ON FUNCTION public.probe(uuid) TO bridge;',
  });
  assert.deepEqual(check(), []);
});
test('revoking ADMIN OPTION cannot hide inherited execution', (t) => {
  const { check } = fixture(t, {
    'b.sql': `GRANT bridge TO anon;
    REVOKE ADMIN OPTION FOR bridge FROM anon;
    GRANT EXECUTE ON FUNCTION public.probe(uuid) TO bridge;`,
  });
  assert.equal(check().length, 1);
});

test('reviewed dynamic exceptions bind the exact path and raw block content', (t) => {
  const sql = 'DO $$ BEGIN EXECUTE command; END $$;';
  const { root, check } = fixture(t, { 'b.sql': sql });
  const finding = check()[0];
  const record = {
    file: 'b.sql',
    blockDigest: finding.blockDigest,
    reason: 'Reviewed fixture only.',
  };
  const run = (reviewedBlocks) =>
    checkRepository({
      root,
      files: ['a.sql', 'b.sql'],
      baseline: [],
      reviewedBlocks,
    });
  assert.deepEqual(run([record]), []);
  for (const changed of [
    { ...record, file: 'copied.sql' },
    { ...record, reason: '' },
    { ...record, blockDigest: undefined },
  ])
    assert.equal(run([changed]).length, 1);
  fs.writeFileSync(
    path.join(root, 'b.sql'),
    sql.replace('EXECUTE command', 'EXECUTE /* changed */ command')
  );
  assert.equal(run([record]).length, 1);
  fs.writeFileSync(
    path.join(root, 'b.sql'),
    '-- unrelated file comment\n' + sql
  );
  assert.deepEqual(run([record]), []);
});

test('both guards use the shared frozen entry and require surviving inherited revokes', (t) => {
  const { FROZEN_DEFINERS } = require('./sql-grant-frozen-definers');
  const entry = FROZEN_DEFINERS.at(-1);
  const prefix = 'apps/database/supabase/migrations/';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-definers-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, prefix), { recursive: true });
  const prior = prefix + '20261027000000_prior.sql';
  const file = prefix + entry.file;
  const name = entry.signature.split('(')[0];
  const definition = `CREATE OR REPLACE FUNCTION ${name}(id uuid) RETURNS void LANGUAGE plpgsql
    SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$ BEGIN RETURN; END $$;`;
  fs.writeFileSync(
    path.join(root, prior),
    definition +
      `REVOKE ALL ON FUNCTION ${entry.signature} FROM ${entry.requiredRevoked.join(',')};`
  );
  fs.writeFileSync(path.join(root, file), definition);
  const check = () =>
    checkRepository({ root, files: [file, prior], baseline: [] });
  assert.deepEqual(check(), []);
  fs.appendFileSync(
    path.join(root, file),
    `GRANT EXECUTE ON FUNCTION ${entry.signature} TO anon;`
  );
  assert.ok(check().some((f) => f.rule === 'public-execute'));
});
