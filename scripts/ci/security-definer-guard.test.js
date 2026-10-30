const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { lintMigration, checkRepository } = require('./security-definer-guard');
const fixture = (name) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

test('rejects the real session function migration before #6993', () => {
  const findings = lintMigration(fixture('session-functions-before-6993.sql'));
  assert.ok(
    findings.some(
      (f) =>
        f.function === 'public.get_user_sessions' &&
        f.rule === 'null-unsafe-auth-guard'
    )
  );
  assert.ok(findings.some((f) => f.rule === 'missing-search-path'));
  assert.ok(findings.some((f) => f.rule === 'public-execute'));
});
test('accepts the unmodified #6993 migration 20261027021000', () => {
  assert.deepEqual(lintMigration(fixture('session-functions-6993.sql')), []);
});

function migration({
  body = 'begin return; end;',
  options = 'set search_path = pg_catalog, pg_temp',
  acl = 'revoke all on function public.probe(uuid) from public, anon;',
} = {}) {
  return (
    'create or replace function public.probe(user_id uuid) returns void language plpgsql security definer ' +
    options +
    ' as $probe$ ' +
    body +
    ' $probe$;\n' +
    acl
  );
}
const rules = (sql) => lintMigration(sql).map((f) => f.rule);
test('requires search_path and explicit execution policy', () => {
  assert.deepEqual(rules(migration()), []);
  assert.deepEqual(rules(migration({ options: '' })), ['missing-search-path']);
  assert.deepEqual(rules(migration({ acl: '' })), ['public-execute']);
  assert.deepEqual(
    rules(
      migration({
        acl: 'grant execute on function public.probe(uuid) to authenticated;',
      })
    ),
    ['public-execute']
  );
  assert.deepEqual(
    rules(
      migration({
        acl: 'revoke all on function public.probe(uuid) from public; grant execute on function public.probe(uuid) to authenticated;',
      })
    ),
    []
  );
  assert.deepEqual(
    rules(
      migration({
        acl: 'revoke all on function public.probe(text) from public, anon;',
      })
    ),
    ['public-execute']
  );
  assert.deepEqual(
    rules(
      migration({
        acl: 'revoke all on function public.probe(uuid) from public, anon; grant execute on function public.probe(uuid) to anon;',
      })
    ),
    ['public-execute']
  );
});
test('comments and strings cannot supply missing safeguards', () => {
  assert.deepEqual(
    rules(
      migration({
        options: '/* set search_path = pg_catalog */',
        acl: '-- revoke all on function public.probe(uuid) from public, anon;\n',
      })
    ),
    ['missing-search-path', 'public-execute']
  );
  assert.deepEqual(
    rules(
      migration({
        body: "begin raise notice 'auth.uid() <> user_id'; /* auth.uid() != user_id */ return; end;",
      })
    ),
    []
  );
});
test('checks each auth comparison instead of trusting a NULL check elsewhere', () => {
  for (const operator of ['<>', '!=']) {
    assert.ok(
      rules(
        migration({
          body:
            'begin if auth.uid() ' +
            operator +
            " user_id then raise exception 'deny'; end if; end;",
        })
      ).includes('null-unsafe-auth-guard')
    );
    assert.ok(
      rules(
        migration({
          body:
            'begin if user_id ' +
            operator +
            " auth.uid() then raise exception 'deny'; end if; end;",
        })
      ).includes('null-unsafe-auth-guard')
    );
    assert.deepEqual(
      rules(
        migration({
          body:
            'begin if auth.uid() is null or auth.uid() ' +
            operator +
            " user_id then raise exception 'deny'; end if; end;",
        })
      ),
      []
    );
  }
  assert.ok(
    rules(
      migration({
        body: "begin if auth.uid() is null then perform 1; end if; if auth.uid() <> user_id then raise exception 'deny'; end if; end;",
      })
    ).includes('null-unsafe-auth-guard')
  );
  assert.ok(
    rules(
      migration({
        body: "begin if auth.uid() is null and auth.uid() <> user_id then raise exception 'deny'; end if; end;",
      })
    ).includes('null-unsafe-auth-guard')
  );
  assert.deepEqual(
    rules(
      migration({
        body: "begin if auth.uid() is distinct from user_id then raise exception 'deny'; end if; end;",
      })
    ),
    []
  );
});
test('historical exceptions bind path, overload, source and ACL bytes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'definer-guard-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = 'old.sql';
  const original = migration({ acl: '' });
  fs.writeFileSync(path.join(root, file), original);
  const baseline = lintMigration(original).map((f) => ({
    file,
    signature: f.signature,
    digest: f.digest,
    rules: [f.rule],
  }));
  const check = () => checkRepository({ root, files: [file], baseline });
  assert.deepEqual(check(), []);
  fs.writeFileSync(
    path.join(root, file),
    original.replace('return;', 'perform 1; return;')
  );
  assert.equal(check().length, 1);
  fs.writeFileSync(
    path.join(root, file),
    `${original}\ngrant execute on function public.probe(uuid) to anon;`
  );
  assert.equal(check().length, 1);
  fs.writeFileSync(path.join(root, file), original);
  assert.equal(
    checkRepository({
      root,
      files: [file],
      baseline: baseline.map((b) => ({ ...b, file: 'other.sql' })),
    }).length,
    1
  );
});
test('parses quoted names, nested comments and tagged function bodies', () => {
  const sql = migration()
    .replaceAll('public.probe', '"public"."probe"')
    .replace('returns void', '/* outer /* inner */ end */ returns void');
  assert.deepEqual(rules(sql), []);
  assert.throws(() => lintMigration('/* unterminated'), /Unterminated/);
});

test('rejects opaque definer alterations and casts do not hide unsafe guards', () => {
  assert.deepEqual(
    rules('alter function public.probe(uuid) security definer;'),
    ['definer-alter-needs-definition']
  );
  for (const comparison of [
    'auth.uid()::uuid <> user_id',
    'user_id <> (select auth.uid())',
  ]) {
    assert.ok(
      rules(
        migration({
          body:
            'begin if ' +
            comparison +
            " then raise exception 'deny'; end if; end;",
        })
      ).includes('null-unsafe-auth-guard')
    );
  }
});

test('bare-name ACL changes invalidate historical exceptions too', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-acl-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = 'old.sql';
  const original = migration({ acl: '' });
  const baseline = lintMigration(original).map((f) => ({
    file,
    signature: f.signature,
    digest: f.digest,
    rules: [f.rule],
  }));
  fs.writeFileSync(path.join(root, file), original);
  assert.deepEqual(checkRepository({ root, files: [file], baseline }), []);
  fs.writeFileSync(
    path.join(root, file),
    `${original}\ngrant execute on function public.probe to anon;`
  );
  assert.equal(checkRepository({ root, files: [file], baseline }).length, 1);
});

for (const role of ['anon', 'PUBLIC']) {
  test(`rejects a later standalone grant to ${role}`, (t) => {
    const { check } = grantFixture(
      t,
      `grant execute on function public.probe(uuid) to ${role};`
    );
    const findings = check();
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'b.sql');
    assert.equal(findings[0].signature, 'public.probe(uuid)');
    assert.equal(findings[0].rule, 'public-execute');
  });
}
function grantFixture(t, sql) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'later-acl-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'a.sql'), migration());
  fs.writeFileSync(path.join(root, 'b.sql'), sql);
  return {
    root,
    check: (baseline = []) =>
      checkRepository({ root, files: ['b.sql', 'a.sql'], baseline }),
  };
}
test('a later grant exception binds grant bytes and earlier definition', (t) => {
  const { root, check } = grantFixture(
    t,
    'grant execute on function public.probe(uuid) to anon;'
  );
  const baseline = check().map((f) => ({ ...f, rules: [f.rule] }));
  assert.equal(baseline.length, 1);
  assert.deepEqual(check(baseline), []);
  fs.appendFileSync(
    path.join(root, 'b.sql'),
    ' grant execute on function public.probe(uuid) to PUBLIC;'
  );
  assert.equal(check(baseline).length, 1);
  fs.writeFileSync(
    path.join(root, 'b.sql'),
    'grant execute on function public.probe(uuid) to anon;'
  );
  fs.writeFileSync(
    path.join(root, 'a.sql'),
    migration({ body: 'begin perform 1; return; end;' })
  );
  assert.equal(check(baseline).length, 1);
});
test('later revokes and policy-permitted authenticated grants are safe', (t) => {
  for (const sql of [
    'revoke execute on function public.probe(uuid) from anon, PUBLIC;',
    'grant execute on function public.probe(uuid) to authenticated;',
    'grant execute on function public.probe(text) to anon;',
  ])
    assert.deepEqual(grantFixture(t, sql).check(), []);
});
test('does not resolve grants against future definitions', (t) => {
  const { root } = grantFixture(
    t,
    'grant execute on function public.probe(uuid) to anon;'
  );
  fs.renameSync(path.join(root, 'a.sql'), path.join(root, 'c.sql'));
  assert.deepEqual(
    checkRepository({ root, files: ['b.sql', 'c.sql'], baseline: [] }),
    []
  );
});
