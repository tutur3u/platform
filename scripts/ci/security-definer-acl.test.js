const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { checkRepository, lintMigration } = require('./security-definer-guard');

function definer(name = 'public.probe', type = 'uuid', kind = 'function') {
  return `create or replace ${kind} ${name}(user_id ${type})
    ${kind === 'function' ? 'returns void' : ''}
    language plpgsql security definer set search_path = pg_catalog, pg_temp
    as $$ begin return; end; $$;
    revoke all on ${kind} ${name}(${type}) from PUBLIC, anon;`;
}
function fixture(t, sql, earlier = definer()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'definer-acl-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'a.sql'), earlier);
  fs.writeFileSync(path.join(root, 'b.sql'), sql);
  return {
    root,
    check: (baseline = []) =>
      checkRepository({ root, files: ['b.sql', 'a.sql'], baseline }),
  };
}
const later = (check) => check().filter((finding) => finding.file === 'b.sql');

for (const targets of [
  'public.probe(uuid), public.other(uuid)',
  'public.probe, public.other',
]) {
  test(`checks every target in ${targets}`, (t) => {
    const { check } = fixture(
      t,
      `grant execute on function ${targets} to PUBLIC;`,
      definer() + definer('public.other')
    );
    assert.deepEqual(
      later(check)
        .map((f) => f.signature)
        .sort(),
      ['public.other(uuid)', 'public.probe(uuid)']
    );
  });
}
for (const kind of ['FUNCTION', 'ROUTINE', 'PROCEDURE']) {
  test(`checks ${kind} grants and grant/revoke ordering`, (t) => {
    const grant = `grant all privileges on ${kind} public.probe(uuid) to anon, PUBLIC;`;
    const revoke = `revoke execute on ${kind} public.probe(uuid) from anon, PUBLIC;`;
    assert.equal(later(fixture(t, grant).check).length, 1);
    assert.deepEqual(fixture(t, revoke).check(), []);
    assert.deepEqual(fixture(t, grant + revoke).check(), []);
    assert.equal(later(fixture(t, revoke + grant).check).length, 1);
  });
}
for (const kind of ['FUNCTIONS', 'ROUTINES', 'PROCEDURES']) {
  test(`checks all ${kind} in each listed schema`, (t) => {
    const earlier =
      definer() + definer('private.other') + definer('unrelated.safe');
    const grant = `grant all on all ${kind} in schema public, private to GROUP anon;`;
    const revoke = `revoke all on all ${kind} in schema public, private from anon;`;
    assert.deepEqual(
      later(fixture(t, grant, earlier).check)
        .map((f) => f.signature)
        .sort(),
      ['private.other(uuid)', 'public.probe(uuid)']
    );
    assert.deepEqual(fixture(t, revoke, earlier).check(), []);
    assert.deepEqual(fixture(t, grant + revoke, earlier).check(), []);
  });
}
test('multi-target revokes remove both grants', (t) => {
  const sql =
    'grant execute on function public.probe(uuid), public.other(uuid) to anon; ' +
    'revoke execute on function public.probe(uuid), public.other(uuid) from anon;';
  assert.deepEqual(
    fixture(t, sql, definer() + definer('public.other')).check(),
    []
  );
});
test('revoking GRANT OPTION does not revoke execution', (t) => {
  const sql =
    'grant execute on function public.probe(uuid) to anon with grant option; ' +
    'revoke grant option for execute on function public.probe(uuid) from anon;';
  assert.equal(later(fixture(t, sql).check).length, 1);
});
test('discovers definer procedures as catalog targets', (t) => {
  const earlier = definer('private.probe', 'uuid', 'procedure');
  assert.deepEqual(lintMigration(earlier), []);
  assert.equal(
    later(
      fixture(
        t,
        'grant execute on procedure private.probe(uuid) to PUBLIC;',
        earlier
      ).check
    ).length,
    1
  );
});

for (const [declared, granted] of [
  ['uuid', 'pg_catalog.uuid'],
  ['uuid', 'IN user_id uuid'],
  ['uuid', 'INOUT user_id pg_catalog.uuid'],
  ['integer', 'int'],
  ['int', 'int4'],
  ['bigint', 'int8'],
  ['smallint', 'int2'],
  ['boolean', 'bool'],
  ['varchar', 'character varying'],
  ['char', 'bpchar'],
  ['numeric', 'decimal'],
  ['double precision', 'float8'],
  ['real', 'float4'],
  ['timestamptz', 'timestamp with time zone'],
  ['timestamp', 'timestamp without time zone'],
  ['timetz', 'time with time zone'],
  ['time', 'time without time zone'],
  ['varbit', 'bit varying'],
  ['uuid[]', 'pg_catalog.uuid[][]'],
  ['varchar', 'character varying(64)'],
  ['timestamptz', 'timestamp(3) with time zone'],
  ['numeric', 'numeric(10,2)'],
]) {
  test(`matches ${declared} with ${granted}`, (t) => {
    const earlier = definer('public.probe', declared);
    const grant = `grant execute on function public.probe(${granted}) to PUBLIC;`;
    assert.equal(later(fixture(t, grant, earlier).check).length, 1);
    assert.deepEqual(
      fixture(
        t,
        grant +
          `revoke execute on function public.probe(${granted}) from PUBLIC;`,
        earlier
      ).check(),
      []
    );
  });
}
test('ambiguous types match by name and arity, while known different overloads do not', (t) => {
  assert.equal(
    later(
      fixture(t, 'grant execute on function public.probe(custom_uuid) to anon;')
        .check
    ).length,
    1
  );
  assert.deepEqual(
    fixture(t, 'grant execute on function public.probe(text) to anon;').check(),
    []
  );
  assert.deepEqual(
    fixture(
      t,
      'grant execute on function public.probe(uuid, uuid) to anon;'
    ).check(),
    []
  );
});
test('an ambiguous revoke cannot cancel an unsafe grant', (t) => {
  const sql =
    'grant execute on function public.probe(uuid) to anon; ' +
    'revoke execute on function public.probe(custom_uuid) from anon;';
  assert.equal(later(fixture(t, sql).check).length, 1);
});
test('unqualified names conservatively match private search_path targets', (t) => {
  const sql =
    'set search_path = private; grant execute on function probe(uuid) to PUBLIC;';
  assert.deepEqual(
    later(fixture(t, sql, definer('private.probe')).check).map(
      (f) => f.signature
    ),
    ['private.probe(uuid)']
  );
  assert.equal(
    later(fixture(t, 'grant execute on function probe(uuid) to anon;').check)
      .length,
    1
  );
});
test('an unqualified revoke cannot establish removal from a qualified function', (t) => {
  const sql =
    'grant execute on function public.probe(uuid) to anon; ' +
    'set search_path = private; revoke execute on function probe(uuid) from anon;';
  assert.equal(later(fixture(t, sql).check).length, 1);
});

for (const body of [
  "EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(uuid) TO PUBLIC', 'public', 'probe');",
  "EXECUTE 'REVOKE ALL ON FUNCTION public.probe(uuid) FROM PUBLIC';",
  "EXECUTE format('ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon');",
  "command := 'GRANT EXECUTE ON FUNCTION public.probe(uuid) TO anon'; EXECUTE command;",
  'GRANT EXECUTE ON FUNCTION public.probe(uuid) TO PUBLIC;',
]) {
  test(`requires review for executable ACL body: ${body}`, (t) => {
    const { check } = fixture(t, `DO $acl$ BEGIN ${body} END $acl$;`);
    assert.ok(later(check).some((f) => f.rule === 'dynamic-execute-acl'));
  });
}
test('checks dynamic ACLs in ordinary invoker function and procedure bodies too', (t) => {
  for (const kind of ['function', 'procedure']) {
    const sql = `create ${kind} public.mutate() ${kind === 'function' ? 'returns void' : ''}
      language plpgsql as $fn$ begin EXECUTE 'GRANT EXECUTE ON FUNCTION public.probe(uuid) TO anon'; end $fn$;`;
    assert.ok(
      later(fixture(t, sql).check).some((f) => f.rule === 'dynamic-execute-acl')
    );
  }
});
test('dynamic privilege exceptions require a reason and bind the complete statement', (t) => {
  const sql =
    "DO $$ BEGIN EXECUTE 'GRANT EXECUTE ON FUNCTION public.probe(uuid) TO PUBLIC'; END $$;";
  const { root, check } = fixture(t, sql);
  const baseline = later(check).map((f) => ({ ...f, rules: [f.rule] }));
  assert.equal(baseline.length, 1);
  assert.equal(check(baseline).length, 1);
  assert.equal(check(baseline.map((b) => ({ ...b, reason: '  ' }))).length, 1);
  const reviewed = baseline.map((b) => ({
    ...b,
    reason: 'Reviewed test-only operation.',
  }));
  assert.deepEqual(check(reviewed), []);
  fs.writeFileSync(path.join(root, 'b.sql'), sql.replace('PUBLIC', 'anon'));
  assert.equal(check(reviewed).length, 1);
});
test('unrelated dynamic SQL and inert privilege strings do not require ACL review', (t) => {
  for (const sql of [
    "DO $$ BEGIN EXECUTE 'SELECT 1'; END $$;",
    "DO $$ BEGIN RAISE NOTICE 'GRANT EXECUTE ON FUNCTION probe(uuid) TO PUBLIC'; END $$;",
  ])
    assert.deepEqual(fixture(t, sql).check(), []);
});
for (const [object, role] of [
  ['FUNCTIONS', 'anon'],
  ['ROUTINES', 'PUBLIC'],
]) {
  test(`rejects default ${object} execution for ${role}`, (t) => {
    const sql = `ALTER DEFAULT PRIVILEGES FOR ROLE owner IN SCHEMA public GRANT EXECUTE ON ${object} TO ${role};`;
    const { check } = fixture(t, sql);
    assert.ok(later(check).some((f) => f.rule === 'unsafe-default-execute'));
    const baseline = later(check).map((f) => ({
      ...f,
      rules: [f.rule],
      reason: 'Reviewed default ACL test.',
    }));
    assert.deepEqual(check(baseline), []);
  });
}
test('default revokes and restricted default grants are safe', (t) => {
  for (const sql of [
    'ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;',
    'ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO authenticated;',
    'ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO anon;',
  ])
    assert.deepEqual(fixture(t, sql).check(), []);
});
test('unsupported execute ACL syntax requires explicit review', (t) => {
  assert.ok(
    later(
      fixture(
        t,
        'GRANT EXECUTE ON FUNCTION public.probe(uuid) unexpected TO anon;'
      ).check
    ).some((f) => f.rule === 'unsupported-execute-acl')
  );
});

test('quoted schema names and recipient keywords cannot hide targets or later PUBLIC', (t) => {
  const earlier = definer('"private.schema".probe');
  assert.equal(
    later(
      fixture(
        t,
        'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "private.schema" TO anon;',
        earlier
      ).check
    ).length,
    1
  );
  assert.equal(
    later(
      fixture(
        t,
        'GRANT EXECUTE ON FUNCTION public.probe(uuid) TO "with", PUBLIC;'
      ).check
    ).length,
    1
  );
});
test('quoted alias-like domain names cannot prove a builtin overload was revoked', (t) => {
  const sql =
    'GRANT EXECUTE ON FUNCTION public.probe(int4) TO anon; ' +
    'REVOKE EXECUTE ON FUNCTION public.probe("integer") FROM anon;';
  assert.equal(
    later(fixture(t, sql, definer('public.probe', 'integer')).check).length,
    1
  );
});

test('quoted routine paths remain distinct catalog entries', (t) => {
  const earlier = definer('public."a.b"') + definer('"public.a".b');
  assert.equal(
    later(
      fixture(
        t,
        'GRANT EXECUTE ON FUNCTION public."a.b"(uuid) TO anon;',
        earlier
      ).check
    ).length,
    1
  );
});
test('function argument defaults are not executed function bodies', (t) => {
  const sql =
    "CREATE FUNCTION public.safe(note text DEFAULT 'EXECUTE GRANT') RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;";
  assert.deepEqual(fixture(t, sql).check(), []);
});

test('array defaults do not add fake arguments and qualified enum types match exactly', (t) => {
  const earlier = `create function public.probe(statuses public.task_board_status[] DEFAULT ARRAY['todo', 'doing']::public.task_board_status[], enabled boolean DEFAULT true)
    returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$ begin return; end; $$;
    revoke all on function public.probe(public.task_board_status[], boolean) from PUBLIC, anon;`;
  assert.deepEqual(lintMigration(earlier), []);
  const grant =
    'grant execute on function public.probe(public.task_board_status[], boolean) to anon;';
  assert.equal(later(fixture(t, grant, earlier).check).length, 1);
  assert.deepEqual(
    fixture(
      t,
      grant +
        'revoke execute on function public.probe(public.task_board_status[], boolean) from anon;',
      earlier
    ).check(),
    []
  );
});

test('reasoned source-bound exceptions cannot hide deletion of an ambiguous revoke', (t) => {
  const earlier = definer('public.probe', 'custom_enum');
  const { root, check } = fixture(t, '', earlier);
  const baseline = check().map((f) => ({
    ...f,
    rules: [f.rule],
    reason: 'Reviewed explicit enum revoke.',
  }));
  assert.equal(baseline.length, 1);
  assert.deepEqual(check(baseline), []);
  fs.writeFileSync(
    path.join(root, 'a.sql'),
    earlier.replace(/revoke all[^;]+;/i, '')
  );
  assert.equal(check(baseline).length, 1);
});

test('the complete repository migration history matches the reviewed baseline', () => {
  assert.deepEqual(
    checkRepository({ root: path.resolve(__dirname, '../..') }),
    []
  );
});

test('quoted argument names do not collide with a zero-argument overload', (t) => {
  const earlier =
    definer().replace('user_id uuid', '"out" uuid') +
    `create function public.probe() returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$ begin return; end; $$;
    revoke all on function public.probe() from PUBLIC, anon;`;
  assert.equal(
    later(
      fixture(
        t,
        'GRANT EXECUTE ON FUNCTION public.probe(uuid) TO anon;',
        earlier
      ).check
    ).length,
    1
  );
});
