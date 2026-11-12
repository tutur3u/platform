const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const debt = require('./sql-frozen-debt');
const { verifyAttestation, ATTESTER } = require('./security-definer-admission');
const sql = 'GRANT SELECT ON public.secret TO anon;';
const finding = { file: 'probe.sql', rule: 'anon-grant', line: 1 };
const id = (text, overrides = {}) =>
  debt.identify('grant', { ...finding, ...overrides }, text);

test('SQL identity survives whitespace, comments and line shifts', () => {
  assert.deepEqual(
    id(sql),
    id('-- header\n\nGRANT /* note */ SELECT\n ON public.secret TO anon;', {
      line: 3,
    })
  );
  assert.deepEqual(
    id('DO $$ BEGIN /* a */ NULL; END $$;'),
    id('DO $body$\n BEGIN NULL; END\n$body$;')
  );
});

test('SQL identity preserves privileges, roles, objects, literals and quoted identifiers', () => {
  for (const changed of [
    sql.replace('SELECT', 'UPDATE'),
    sql.replace('anon', 'PUBLIC'),
    sql.replace('secret', 'other'),
  ])
    assert.notDeepEqual(id(sql), id(changed));
  assert.notDeepEqual(id("SELECT 'a b';"), id("SELECT 'a  b';"));
  assert.notDeepEqual(id('SELECT "Case";'), id('SELECT "case";'));
  assert.notDeepEqual(
    id("DO $$ BEGIN EXECUTE 'GRANT SELECT'; END $$;"),
    id("DO $$ BEGIN EXECUTE 'GRANT UPDATE'; END $$;")
  );
});

test('ACL context changes identity even when the offending CREATE is unchanged', () => {
  const create =
    'CREATE FUNCTION public.f() RETURNS int LANGUAGE sql AS $$SELECT 1$$;\n';
  assert.notDeepEqual(
    id(create + sql),
    id(create + sql.replace('SELECT', 'UPDATE'))
  );
});

test('baseline allows removal and rejects additions and same-count replacements', () => {
  const original = [id(sql)];
  assert.deepEqual(debt.additions([], original), []);
  for (const replacement of [
    id(sql.replace('SELECT', 'UPDATE')),
    id(sql, { file: 'newpath.sql' }),
    id(sql, { rule: 'newrule' }),
  ]) {
    assert.equal(debt.additions([replacement], original).length, 1);
  }
  assert.equal(debt.additions(original, []).length, 1);
  assert.throws(
    () => debt.validate([{ ...original[0], reviewed: true }]),
    /Invalid/
  );
});

test('unknown findings fail; stale entries require deliberate removal', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-debt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, finding.file), sql);
  const baseline = [id(sql)];
  assert.deepEqual(debt.enforce('grant', [finding], root, baseline), []);
  assert.equal(debt.enforce('grant', [finding], root, []).length, 1);
  assert.equal(
    debt.enforce('grant', [], root, baseline)[0].rule,
    'frozen-debt-stale'
  );
  assert.deepEqual(debt.enforce('grant', [], root, []), []);
  fs.writeFileSync(
    path.join(root, finding.file),
    sql.replace('SELECT', 'UPDATE')
  );
  assert.equal(debt.enforce('grant', [finding], root, baseline).length, 2);
});

test('SQL debt attestation rejects missing, self-declared, wrong-head digest and failed statuses', async () => {
  const context = 'security/sql-frozen-debt-admission';
  const description = 'sql-debt sha256:' + 'a'.repeat(64);
  const options = {
    additions: [],
    head: 'b'.repeat(40),
    token: 'fixture',
    context,
    description,
  };
  const fetch = (entry) => async (url) => {
    assert.ok(url.includes(options.head));
    return { ok: true, json: async () => (entry ? [entry] : []) };
  };
  const good = { context, description, state: 'success', creator: ATTESTER };
  for (const entry of [
    null,
    { ...good, creator: { login: 'self', id: 1 } },
    { ...good, description: 'wrong' },
    { ...good, state: 'failure' },
  ])
    await assert.rejects(
      verifyAttestation({ ...options, fetch: fetch(entry) })
    );
  assert.equal(
    await verifyAttestation({ ...options, fetch: fetch(good) }),
    description
  );
});

test('frozen debt is deterministic scanner output and includes both scanners', () => {
  const root = path.resolve(__dirname, '../..');
  const baseline = JSON.parse(
    fs.readFileSync(path.join(root, debt.FILE), 'utf8')
  );
  debt.validate(baseline);
  assert.deepEqual(debt.collect(root), baseline);
  assert.deepEqual(debt.canonical([...baseline].reverse()), baseline);
  assert.deepEqual([...new Set(baseline.map((e) => e.scanner))].sort(), [
    'definer',
    'grant',
  ]);
});

test('repeating an identical offending statement cannot reuse one baseline entry', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-debt-count-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, finding.file), sql + '\n' + sql);
  const findings = [finding, { ...finding, line: 2 }];
  const baseline = [id(sql)];
  assert.equal(
    debt.enforce('grant', findings, root, baseline).length > 0,
    true
  );
});

test('CI bootstrap fails closed without a base-owned SQL debt verifier', () => {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/security-checks.yaml'),
    'utf8'
  );
  assert.match(
    workflow,
    /if test -f scripts\/ci\/sql-frozen-debt.json && ! git cat-file -e "\$BASE_SHA:scripts\/ci\/sql-frozen-debt.js"/
  );
  assert.match(workflow, /purpose: 'sql-frozen-debt-bootstrap'/);
  assert.match(workflow, /trusted.verifyAttestation/);
  assert.match(workflow, /Bootstrap checkout\/head mismatch/);
});

test('editing a rollback requires clearing its debt; unrelated applied SQL remains inventoried', () => {
  const entry = id(sql, { file: 'apps/database/rollbacks/probe.rollback.sql' });
  assert.throws(
    () => debt.assertRollbackEdits([entry], [entry.path]),
    /Edited rollbacks/
  );
  debt.assertRollbackEdits([], [entry.path]);
  debt.assertRollbackEdits([entry], ['apps/database/scripts/probe.sql']);
});
