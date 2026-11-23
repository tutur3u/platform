const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  checkRepository,
  lintMigration,
  verifyRemediation,
} = require('./security-definer-guard');

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
      checkRepository({
        root,
        files: ['b.sql', 'a.sql'],
        baseline,
        verifiedFindings: [],
      }),
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

test('the reviewed storage ACL proof rejects changed access contracts', () => {
  const entry = require('./security-definer-verified-findings.json').find(
    (record) => record.remediationMode === 'acl-only'
  );
  const root = path.resolve(__dirname, '../..');
  const original = fs.readFileSync(path.join(root, entry.file), 'utf8');
  const remediation = fs.readFileSync(
    path.join(root, entry.remediationMigration),
    'utf8'
  );
  const proof = { original, entry, intervening: [], later: [] };
  assert.equal(verifyRemediation(remediation, proof), true);
  for (const rejected of [
    remediation.replace('public, anon', 'public'),
    remediation.replace('authenticated, service_role', 'authenticated, anon'),
    remediation.replaceAll('object_access', 'actor_access'),
  ]) {
    assert.equal(verifyRemediation(rejected, proof), false);
  }
  for (const intervening of [
    'create table private.fixture (id uuid primary key);',
    'alter table private.fixture enable row level security;',
    'drop table if exists private.fixture;',
  ]) {
    assert.equal(
      verifyRemediation(remediation, { ...proof, intervening: [intervening] }),
      true,
      intervening
    );
  }
  for (const intervening of [
    'create table fixture (id uuid primary key);',
    'create table workspace_storage.fixture (id uuid primary key);',
    'alter table private.fixture set schema workspace_storage;',
    'drop table private.fixture cascade;',
    'alter type workspace_storage.actor_access rename to moved;',
    'create domain private.fixture as text;',
  ]) {
    assert.equal(
      verifyRemediation(remediation, { ...proof, intervening: [intervening] }),
      false,
      intervening
    );
  }
  for (const later of [
    'grant execute on function workspace_storage.object_access(text, text, workspace_storage.actor_access) to anon;',
    'grant execute on all functions in schema workspace_storage to public;',
  ]) {
    assert.equal(
      verifyRemediation(remediation, { ...proof, later: [later] }),
      false
    );
  }
  assert.equal(
    verifyRemediation(remediation, {
      ...proof,
      entry: { ...entry, remediationDigest: '0'.repeat(64) },
    }),
    false
  );
});

test('the storage ACL proof rejects moves, re-grants and hidden identifiers around it', () => {
  const entry = require('./security-definer-verified-findings.json').find(
    (record) => record.remediationMode === 'acl-only'
  );
  const root = path.resolve(__dirname, '../..');
  const original = fs.readFileSync(path.join(root, entry.file), 'utf8');
  const remediation = fs.readFileSync(
    path.join(root, entry.remediationMigration),
    'utf8'
  );
  const proof = { original, entry, intervening: [], later: [] };
  const routine =
    'workspace_storage.object_access(text, text, workspace_storage.actor_access)';
  assert.equal(
    verifyRemediation(
      remediation.replace('public, anon', '"public", anon'),
      proof
    ),
    false
  );
  for (const later of [
    `grant execute on function ${routine} to service_role;`,
    'do $$ begin perform 1; end $$;',
    'alter function public.other() set search_path = pg_catalog;',
    'grant usage on schema private to authenticated;',
    'create table private.periods (ws_id uuid, period tstzrange, exclude using gist (ws_id with =, period with &&));',
    "select '{}'::jsonb ?& array['a'];",
    'alter role authenticated set statement_timeout = 8000;',
    "comment on table private.periods is 'it''s the owner''s -- note';",
    "create function private.h() returns void language plpgsql as $$ begin raise exception 'can''t continue'; end $$;",
    "do $$ begin execute format('alter table private.periods owner to %I', 'postgres'); end $$;",
    'create function private.g() returns void language plpgsql as $$ begin grant select on private.periods to service_role; end $$;',
  ]) {
    assert.equal(
      verifyRemediation(remediation, { ...proof, later: [later] }),
      true,
      later
    );
  }
  const scoped = [
    `alter function ${routine} set schema public; grant execute on function public.object_access(text, text, workspace_storage.actor_access) to anon;`,
    `alter function ${routine} rename to object_access_v2;`,
    'alter schema workspace_storage rename to moved;',
    `grant execute on function ${routine} to authenticated with grant option;`,
    `grant execute on function ${routine} to dashboard_user;`,
    'grant authenticated to anon;',
    `do $$ begin execute 'grant execute on function ${routine} to anon'; end $$;`,
    'grant execute on function postgres.workspace_storage.object_access(text, text, workspace_storage.actor_access) to anon;',
    'grant execute on function postgres.workspace_storage.object_access to anon;',
    'alter type workspace_storage.actor_access rename to actor_access_v2;',
    'alter type workspace_storage.actor_access set schema public;',
    'alter group authenticated add user anon;',
    'create role custom_reader in role authenticated;',
    "do $$ begin execute 'alter group authenticated add user anon'; end $$;",
    'alter /* c */ group authenticated add user anon;',
    'alter -- c\ngroup authenticated add user anon;',
    'create role helper_role in /* c */ role authenticated;',
    'create role helper_role in role /* ; */ authenticated;',
    'grant pg_read_all_stats, authenticated to helper_role;',
    'alter group authenticator add user anon;',
    'alter /* -- */ group authenticated add user anon;',
    'create /* -- */ role bridge in role authenticated role anon;',
    "do $$ begin perform '--'; alter /* x */ group authenticated add user anon; end $$;",
    'grant /* on -- */ authenticated to anon;',
    'grant authenticated, "on" to anon;',
    "create function public.f() returns void language sql as 'alter group authenticated add user anon';",
    'create function private.f1() returns void language plpgsql as $d1$ begin create function private.f2() returns void language plpgsql as $d2$ begin create function private.f3() returns void language plpgsql as $d3$ begin create function private.f4() returns void language plpgsql as $d4$ begin create function private.f5() returns void language plpgsql as $d5$ begin create function private.f6() returns void language plpgsql as $d6$ begin create function private.f7() returns void language plpgsql as $d7$ begin create function private.f8() returns void language plpgsql as $d8$ begin create function private.f9() returns void language plpgsql as $d9$ begin alter /* x */ group authenticated add user anon; end $d9$; end $d8$; end $d7$; end $d6$; end $d5$; end $d4$; end $d3$; end $d2$; end $d1$;',
    "create function private.f1() returns void language plpgsql as $d1$ begin create function private.f2() returns void language plpgsql as $d2$ begin perform E'\\''; alter /* x */ group authenticated add user anon; end; $d2$; end; $d1$;",
    "create function public.f() returns void language sql as 'alter gro'\n'up authenticated add user anon';",
    "do 'begin alter gro'\n'up authenticated add user anon; end;';",
    "do E'begin alter \\x47roup authenticated add user anon; end;';",
    "create function private.pwn() returns void language sql as E'alter \\x47roup authenticated add user anon';",
    "do 'begin alter function workspace_'\n'storage.object_'\n'access(text, text, workspace_'\n'storage.actor_'\n'access) rename to helper; end;';",
    "create function private.w() returns void language plpgsql as 'begin create function private.pwn() returns void language sql as U'\n'&''alter \\0047roup authenticated add user anon''; end;';",
    "do $o$ begin create function private.pwn() returns void language plpgsql as $i$ begin execute 'alter ' || 'group authenticated add user anon'; end; $i$; end; $o$;",
    "create function private.pwn() returns void language plpgsql as $o$ begin do $i$ begin execute format('%s %s authenticated add user anon', 'alter', 'group'); end; $i$; end; $o$;",
    `create function public.reorg() returns void language plpgsql as $$ begin alter function ${routine} set schema public; end; $$;`,
    "do $$ begin execute U&'grant \\0061'; end $$;",
  ];
  for (const sql of scoped) {
    for (const key of ['intervening', 'later']) {
      assert.equal(
        verifyRemediation(remediation, { ...proof, [key]: [sql] }),
        false,
        `${key}: ${sql}`
      );
    }
  }
  for (const intervening of [
    'alter table postgres.U&"workspace\\005fstorage".actor_access rename to old;',
    'alter table private.fixture set schema U&"workspace\\005fstorage";',
    'drop table private.fixture, actor_access;',
    'alter table postgres.private.fixture rename to old;',
  ]) {
    assert.equal(
      verifyRemediation(remediation, { ...proof, intervening: [intervening] }),
      false,
      intervening
    );
  }
});

test('reviewed later migrations bypass the storage proof only at their exact digest', () => {
  const { withoutReviewedLater } = require('./security-definer-blocks');
  const crypto = require('node:crypto');
  const source =
    'create role fixture_reviewed nologin; grant fixture_reviewed to authenticator;';
  const digest = crypto.createHash('sha256').update(source).digest('hex');
  const reviewed = [{ file: 'x.sql', sourceDigest: digest, reason: 'fixture' }];
  assert.deepEqual(withoutReviewedLater([source], reviewed), []);
  assert.deepEqual(withoutReviewedLater([source + ' '], reviewed), [
    source + ' ',
  ]);
  assert.deepEqual(
    withoutReviewedLater([source], [{ ...reviewed[0], reason: ' ' }]),
    [source]
  );
});

test('the pinned memory migration is the only reviewed exception to the storage proof', (t) => {
  const { storageAclReviewedLater } = require('./security-definer-blocks');
  const entry = require('./security-definer-verified-findings.json').find(
    (record) => record.remediationMode === 'acl-only'
  );
  const root = path.resolve(__dirname, '../..');
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const remediation = read(entry.remediationMigration);
  const proof = {
    original: read(entry.file),
    entry,
    intervening: [],
    later: [],
  };
  const unlisted =
    'create role fixture_unlisted nologin; grant fixture_unlisted to authenticator;';
  assert.equal(
    verifyRemediation(remediation, { ...proof, later: [unlisted] }),
    false
  );
  for (const pinned of storageAclReviewedLater) {
    assert.ok(pinned.reason.trim().length > 0);
    assert.ok(pinned.file > entry.remediationMigration, pinned.file);
    if (!fs.existsSync(path.join(root, pinned.file))) {
      t.diagnostic(`${pinned.file} is not in this checkout yet`);
      continue;
    }
    const source = read(pinned.file);
    assert.equal(
      require('node:crypto').createHash('sha256').update(source).digest('hex'),
      pinned.sourceDigest
    );
    assert.equal(
      verifyRemediation(remediation, { ...proof, later: [source] }),
      true
    );
    assert.equal(
      verifyRemediation(remediation, {
        ...proof,
        later: [source + '\n-- edited'],
      }),
      false
    );
    assert.equal(
      verifyRemediation(remediation, { ...proof, later: [source, unlisted] }),
      false
    );
  }
});

test('the storage ACL proof reads every versioned migration file', (t) => {
  const { trustedRecordsForScan } = require('./security-definer-admission');
  const entry = require('./security-definer-verified-findings.json').find(
    (record) => record.remediationMode === 'acl-only'
  );
  const source = path.resolve(__dirname, '../..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'definer-acl-scan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, path.dirname(entry.file));
  fs.mkdirSync(dir, { recursive: true });
  for (const file of [entry.file, entry.remediationMigration])
    fs.copyFileSync(path.join(source, file), path.join(root, file));
  const git = (...args) =>
    require('node:child_process').execFileSync('git', args, {
      cwd: root,
      stdio: 'ignore',
    });
  git('init', '-q');
  git('add', '.');
  const scan = () =>
    trustedRecordsForScan(root, [entry], verifyRemediation, {}).length;
  assert.equal(scan(), 1);
  const grant =
    'grant execute on function workspace_storage.object_access(text, text, workspace_storage.actor_access) to dashboard_user;';
  for (const name of ['20261123000000_storage_v2.0.sql', 'notes.sql']) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, grant);
    git('add', '.');
    assert.equal(scan(), 0, name);
    git('rm', '-q', '--cached', file);
    fs.rmSync(file);
  }
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
