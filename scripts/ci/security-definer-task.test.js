const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { checkRepository } = require('./security-definer-guard');

function repository(t, later) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'definer-task-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const definition = (name, type) => `CREATE FUNCTION public.${name}(id ${type})
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp AS $$ BEGIN RETURN; END; $$;
    REVOKE ALL ON FUNCTION public.${name}(${type}) FROM PUBLIC, anon;`;
  fs.writeFileSync(
    path.join(root, 'a.sql'),
    definition('probe', 'integer') + definition('other', 'uuid')
  );
  fs.writeFileSync(path.join(root, 'b.sql'), later);
  return checkRepository({ root, files: ['b.sql', 'a.sql'], baseline: [] });
}

for (const target of [
  'FUNCTION public.probe(integer), public.other(uuid)',
  'ALL FUNCTIONS IN SCHEMA public',
]) {
  test(`two-file public grant checks both targets: ${target}`, (t) => {
    const findings = repository(t, `GRANT EXECUTE ON ${target} TO PUBLIC;`);
    assert.deepEqual(
      findings.map((f) => [f.file, f.signature, f.rule]).sort(),
      [
        ['b.sql', 'public.other(uuid)', 'public-execute'],
        ['b.sql', 'public.probe(int4)', 'public-execute'],
      ]
    );
  });
}

test('two-file grant matches case, whitespace, argument name, mode and type alias', (t) => {
  const findings = repository(
    t,
    'GRANT EXECUTE ON FUNCTION PUBLIC.PROBE( IN target_id PG_CATALOG . INT4 ) TO anon;'
  );
  assert.deepEqual(
    findings.map((f) => [f.file, f.signature, f.rule]),
    [['b.sql', 'public.probe(int4)', 'public-execute']]
  );
});

for (const body of [
  "EXECUTE 'GRANT EXECUTE ON FUNCTION public.probe(integer) TO PUBLIC';",
  "EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(integer) FROM PUBLIC', 'public', 'probe');",
]) {
  test(`two-file dynamic ACL explicitly requires manual review: ${body}`, (t) => {
    const findings = repository(t, `DO $acl$ BEGIN ${body} END $acl$;`);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'b.sql');
    assert.equal(findings[0].rule, 'dynamic-execute-acl');
    assert.match(findings[0].message, /manual review required/i);
  });
}

for (const sql of [
  'GRANT EXECUTE ON FUNCTION public.probe(IN id pg_catalog.int4), public.other(uuid) TO authenticated;',
  'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;',
  "DO $$ BEGIN EXECUTE 'SELECT 1'; END $$;",
]) {
  test(`two-file safe control: ${sql}`, (t) => {
    assert.deepEqual(repository(t, sql), []);
  });
}
