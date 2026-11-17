const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  AllowlistError,
  compareWithBase,
  expiredCompatViews,
  parseAllowlist,
} = require('./public-schema-guard/allowlist.js');
const { lintMigration } = require('./public-schema-guard/migration-lint.js');
const { scanText } = require('./public-schema-guard/callers.js');
const {
  checkTypes,
  parsePublicTypes,
  run,
} = require('./check-public-schema-objects.js');

function allowlist(overrides = {}) {
  return {
    version: 1,
    currentWave: 0,
    lintAfterVersion: '20261117063000',
    relations: {
      workspaces: { kind: 'table', wave: 8 },
      notes: { kind: 'table', wave: 5 },
    },
    moved: {},
    serviceRoleCompatViews: {},
    defaultAclExemptOwners: {},
    platformObjects: {},
    clientViewExceptions: {},
    typesAhead: {},
    functions: { enforced: false, names: {} },
    ...overrides,
  };
}

function lint(sql, options = {}) {
  return lintMigration({
    file: 'm.sql',
    sql,
    allowed: new Set(['workspaces', 'notes']),
    allowedFunctions: new Set(),
    functionsEnforced: false,
    ...options,
  });
}

const errorKinds = (findings) =>
  findings.filter((f) => f.severity === 'error').map((f) => f.kind);

test('parseAllowlist rejects malformed documents', () => {
  assert.throws(() => parseAllowlist('{'), AllowlistError);
  assert.throws(
    () => parseAllowlist(JSON.stringify(allowlist({ version: 2 }))),
    /version/u
  );
  assert.throws(
    () =>
      parseAllowlist(
        JSON.stringify(
          allowlist({ relations: { Bad: { kind: 'table', wave: 1 } } })
        )
      ),
    /invalid name/u
  );
  assert.throws(
    () =>
      parseAllowlist(
        JSON.stringify(
          allowlist({ moved: { notes: { wave: 5, schema: 'private' } } })
        )
      ),
    /also allowlisted/u
  );
  assert.throws(
    () =>
      parseAllowlist(
        JSON.stringify(
          allowlist({
            serviceRoleCompatViews: {
              x: { expiresAfterWave: 2, target: 'public.x' },
            },
          })
        )
      ),
    /target private/u
  );
  assert.equal(parseAllowlist(JSON.stringify(allowlist())).currentWave, 0);
});

test('compareWithBase allows shrinking with a moved record and rejects growth', () => {
  const base = allowlist();
  const shrunk = allowlist({
    relations: { workspaces: { kind: 'table', wave: 8 } },
    moved: { notes: { wave: 5, schema: 'private' } },
    currentWave: 5,
  });
  assert.deepEqual(compareWithBase(shrunk, base), []);
  const grown = allowlist({
    relations: { ...base.relations, extra: { kind: 'table', wave: 1 } },
  });
  assert.match(compareWithBase(grown, base)[0], /relations\.extra was added/u);
  const dropped = allowlist({
    relations: { workspaces: { kind: 'table', wave: 8 } },
  });
  assert.match(
    compareWithBase(dropped, base)[0],
    /without a moved\.notes or typesAhead\.notes record/u
  );
  assert.match(
    compareWithBase(allowlist({ lintAfterVersion: '20991231000000' }), base)[0],
    /lintAfterVersion/u
  );
  assert.match(
    compareWithBase(base, shrunk).join('\n'),
    /currentWave decreased/u
  );
  const exempt = allowlist({
    defaultAclExemptOwners: { supabase_admin: { reason: 'platform' } },
  });
  assert.match(
    compareWithBase(exempt, base)[0],
    /defaultAclExemptOwners\.supabase_admin was added/u
  );
  assert.deepEqual(compareWithBase(base, exempt), []);
  const legacy = JSON.stringify(
    allowlist({
      relations: { notes: { kind: 'table', wave: 5, retained: true } },
    })
  );
  assert.throws(() => parseAllowlist(legacy), /retained is not accepted/u);
  assert.equal(
    parseAllowlist(legacy, { base: true }).relations.notes.retained,
    true
  );
});

test('typesAhead narrows an allowlisted relation and never adds a name', () => {
  const ahead = {
    wave: 5,
    owner: 'notes',
    reason: 'typed ahead of its migration',
    evidence: 'absent from replay and hosted readback',
  };
  const base = parseAllowlist(JSON.stringify(allowlist()), { base: true });
  const narrowed = parseAllowlist(
    JSON.stringify(
      allowlist({
        relations: { workspaces: { kind: 'table', wave: 8 } },
        typesAhead: { notes: ahead },
      })
    )
  );
  assert.deepEqual(compareWithBase(narrowed, base), []);
  const invented = parseAllowlist(
    JSON.stringify(allowlist({ typesAhead: { fresh: ahead } }))
  );
  assert.match(
    compareWithBase(invented, base).join('\n'),
    /typesAhead\.fresh was added/u
  );
  assert.deepEqual(compareWithBase(base, narrowed), [
    'relations.notes was added; create the relation in private instead',
  ]);
  assert.throws(
    () =>
      parseAllowlist(
        JSON.stringify(
          allowlist({ typesAhead: { notes: { ...ahead, evidence: '' } } })
        )
      ),
    /typesAhead\.notes is also allowlisted|needs evidence/u
  );
  assert.throws(
    () =>
      parseAllowlist(
        JSON.stringify(
          allowlist({
            relations: { workspaces: { kind: 'table', wave: 8 } },
            typesAhead: { notes: { ...ahead, owner: ' ' } },
          })
        )
      ),
    /needs owner/u
  );
  const types = { Tables: new Set(['workspaces']), Views: new Set() };
  assert.match(
    checkTypes(narrowed, types).join('\n'),
    /typesAhead\.notes is stale/u
  );
  assert.deepEqual(
    checkTypes(narrowed, {
      Tables: new Set(['workspaces', 'notes']),
      Views: new Set(),
    }),
    []
  );
});

test('fields introduced after the base may be populated, then only shrink', () => {
  const { platformObjects, clientViewExceptions, ...legacy } = allowlist();
  const base = parseAllowlist(JSON.stringify(legacy));
  assert.deepEqual(base.platformObjects, {});
  const populated = parseAllowlist(
    JSON.stringify(
      allowlist({
        platformObjects: { 'function:graphql(text)': { reason: 'platform' } },
        clientViewExceptions: { note_stats: { reason: 'aggregate' } },
      })
    )
  );
  assert.deepEqual(compareWithBase(populated, base), []);
  const grown = parseAllowlist(
    JSON.stringify(
      allowlist({
        platformObjects: {
          'function:graphql(text)': { reason: 'platform' },
          'relation:extra': { reason: 'platform' },
        },
        clientViewExceptions: { note_stats: { reason: 'aggregate' } },
      })
    )
  );
  assert.match(
    compareWithBase(grown, populated).join('\n'),
    /platformObjects\.relation:extra was added/u
  );
  assert.throws(
    () =>
      parseAllowlist(
        JSON.stringify(
          allowlist({ platformObjects: { 'table:x': { reason: 'r' } } })
        )
      ),
    /invalid key/u
  );
  assert.throws(
    () =>
      parseAllowlist(
        JSON.stringify(allowlist({ clientViewExceptions: { notes: {} } }))
      ),
    /needs a reason/u
  );
});

test('expired compat views are violations', () => {
  const value = allowlist({
    currentWave: 3,
    serviceRoleCompatViews: {
      tasks: { expiresAfterWave: 2, target: 'private.tasks' },
    },
  });
  assert.match(expiredCompatViews(value)[0], /expired after wave 2/u);
});

test('lint flags new public relations in every creation form', () => {
  assert.deepEqual(errorKinds(lint('create table public.fresh (id int);')), [
    'CREATE TABLE',
  ]);
  assert.deepEqual(
    errorKinds(lint('CREATE TABLE IF NOT EXISTS "public"."Fresh" (id int);')),
    ['CREATE TABLE']
  );
  assert.deepEqual(errorKinds(lint('create unlogged table fresh (id int);')), [
    'CREATE TABLE',
  ]);
  assert.deepEqual(
    errorKinds(
      lint(
        'create table fresh partition of public.workspaces for values in (1);'
      )
    ),
    ['CREATE TABLE']
  );
  assert.deepEqual(errorKinds(lint('create table public.fresh as select 1;')), [
    'CREATE TABLE',
  ]);
  assert.deepEqual(
    errorKinds(
      lint('create or replace materialized view public.fresh as select 1;')
    ),
    ['CREATE VIEW']
  );
  assert.deepEqual(
    errorKinds(lint('create foreign table public.fresh (id int) server s;')),
    ['CREATE FOREIGN TABLE']
  );
  assert.deepEqual(errorKinds(lint('select 1 as id into public.fresh;')), [
    'SELECT INTO',
  ]);
  assert.deepEqual(
    errorKinds(lint('alter table private.fresh set schema public;')),
    ['SET SCHEMA public']
  );
  assert.deepEqual(
    errorKinds(lint('alter table public.notes rename to fresh;')),
    ['RENAME']
  );
  assert.deepEqual(
    errorKinds(
      lint("do $$ begin execute 'create table public.fresh (id int)'; end $$;")
    ),
    ['CREATE TABLE']
  );
});

test('lint allows private, temporary, allowlisted and commented relations', () => {
  assert.deepEqual(lint('create table private.fresh (id int);'), []);
  assert.deepEqual(lint('create temp table fresh (id int);'), []);
  assert.deepEqual(lint('create temporary view fresh as select 1;'), []);
  assert.deepEqual(
    lint('create table if not exists public.notes (id int);'),
    []
  );
  assert.deepEqual(
    lint(
      '-- create table public.fresh (id int);\n/* create view public.x as select 1; */'
    ),
    []
  );
  assert.deepEqual(
    lint('set search_path = private, public;\ncreate table fresh (id int);'),
    []
  );
  assert.deepEqual(lint('alter table public.notes set schema private;'), []);
  assert.deepEqual(
    lint(
      'create function private.f() returns void language plpgsql as $$ declare v int; begin select 1 into v; end $$;'
    ),
    []
  );
  assert.deepEqual(
    lint(
      'with s as (select 1 as id) insert into public.notes (id) select id from s;'
    ),
    []
  );
});

test('lint flags client grants and client default privileges', () => {
  assert.deepEqual(
    errorKinds(lint('grant select on public.notes to authenticated;')),
    ['GRANT']
  );
  assert.deepEqual(
    errorKinds(lint('grant all on table notes, workspaces to anon;')),
    ['GRANT', 'GRANT']
  );
  assert.deepEqual(
    errorKinds(lint('grant select on all tables in schema public to anon;')),
    ['GRANT']
  );
  assert.deepEqual(lint('grant all on public.notes to service_role;'), []);
  assert.deepEqual(
    lint('grant execute on function public.f() to authenticated;'),
    []
  );
  assert.deepEqual(lint('grant usage on schema public to anon;'), []);
  assert.deepEqual(
    lint("execute format('grant select on %I.%I to authenticated', s, t);"),
    []
  );
  assert.deepEqual(
    errorKinds(
      lint(
        'alter default privileges for role postgres in schema public grant select on tables to anon;'
      )
    ),
    ['DEFAULT PRIVILEGES']
  );
  assert.deepEqual(
    errorKinds(
      lint(
        'alter default privileges grant usage on sequences to authenticated;'
      )
    ),
    ['DEFAULT PRIVILEGES']
  );
  assert.deepEqual(
    lint(
      'alter default privileges in schema private grant select on tables to anon;'
    ),
    []
  );
  const fn = lint(
    'alter default privileges in schema public grant execute on functions to authenticated;'
  );
  assert.deepEqual(
    fn.map((f) => f.severity),
    ['warning']
  );
});

test('lint warns on new public functions until enforced', () => {
  const sql =
    'create or replace function public.do_thing() returns void language sql as $$ select 1 $$;';
  assert.deepEqual(
    lint(sql).map((f) => f.severity),
    ['warning']
  );
  assert.deepEqual(errorKinds(lint(sql, { functionsEnforced: true })), [
    'CREATE FUNCTION',
  ]);
  assert.deepEqual(
    lint(sql, {
      functionsEnforced: true,
      allowedFunctions: new Set(['do_thing']),
    }),
    []
  );
  assert.deepEqual(
    lint(
      'create function private.do_thing() returns int language sql as $$ select 1 $$;'
    ),
    []
  );
});

test('caller scan rejects direct client access to moved relations', () => {
  const moved = new Set(['notes']);
  const scan = (text, kind) => scanText({ file: 'f', text, kind, moved });
  assert.equal(
    scan("const { data } = await supabase.from('notes').select();", 'ts')
      .length,
    1
  );
  assert.equal(
    scan("await admin.schema('private').from('notes').select();", 'ts').length,
    0
  );
  assert.equal(
    scan("await admin\n  .schema('private')\n  .from('notes')", 'ts').length,
    0
  );
  assert.equal(
    scan("'use client';\nawait db.schema('private').from('notes');", 'ts')
      .length,
    1
  );
  assert.equal(
    scan("await supabase.from('workspaces').select();", 'ts').length,
    0
  );
  assert.equal(scan("await client.from('notes').select();", 'dart').length, 1);
  assert.equal(scan('supabase.table("notes").select("*")', 'python').length, 1);
  assert.equal(
    scan('supabase.schema("private").table("notes").select("*")', 'python')
      .length,
    0
  );
});

test('generated types must stay within the allowlist', () => {
  const types = parsePublicTypes(
    [
      'export type Database = {',
      '  public: {',
      '    Tables: {',
      '      notes: {',
      '        Row: {',
      '      fresh: {',
      '    Views: {',
      '      workspaces: {',
      '    Functions: {',
      '  }',
    ].join('\n')
  );
  const findings = checkTypes(allowlist(), types);
  assert.equal(findings.length, 2);
  assert.match(
    findings.join('\n'),
    /public\.Tables\.fresh is not allowlisted/u
  );
  assert.match(
    findings.join('\n'),
    /relations\.workspaces kind table does not match/u
  );
  assert.throws(
    () => parsePublicTypes('export type Database = {}'),
    /public schema block/u
  );
});

function fixtureRepo({ baseAllowlist, baseScript }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-schema-guard-'));
  const sh = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  sh('init', '-q', '-b', 'main');
  sh('config', 'user.email', 'guard@example.invalid');
  sh('config', 'user.name', 'guard');
  write(
    'packages/types/src/supabase.ts',
    '  public: {\n    Tables: {\n      notes: {\n    Views: {\n    Functions: {\n  }\n'
  );
  write(
    'apps/database/supabase/migrations/20200101000000_init.sql',
    'create table public.legacy (id int);\n'
  );
  if (baseAllowlist)
    write(
      'apps/database/public-schema-allowlist.json',
      JSON.stringify(baseAllowlist)
    );
  if (baseScript) write('scripts/check-public-schema-objects.js', '// guard\n');
  sh('add', '-A');
  sh('commit', '-q', '-m', 'base');
  const base = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).stdout.trim();
  return { root, base, write, sh };
}

const quiet = { log: () => {}, error: () => {} };

test('run fails closed when the base allowlist is unreadable', () => {
  const { root, base, write } = fixtureRepo({
    baseAllowlist: null,
    baseScript: true,
  });
  write(
    'apps/database/public-schema-allowlist.json',
    JSON.stringify(
      allowlist({ relations: { notes: { kind: 'table', wave: 5 } } })
    )
  );
  assert.equal(
    run({ cwd: root, env: { PUBLIC_SCHEMA_BASE_SHA: base }, ...quiet }),
    2
  );
  assert.equal(
    run({
      cwd: root,
      env: { PUBLIC_SCHEMA_BASE_SHA: '0'.repeat(40) },
      ...quiet,
    }),
    2
  );
  assert.equal(
    run({ cwd: root, env: { PUBLIC_SCHEMA_BASE_BRANCH: 'missing' }, ...quiet }),
    2
  );
});

test('run accepts the introducing change and rejects allowlist growth', () => {
  const intro = fixtureRepo({ baseAllowlist: null, baseScript: false });
  const current = allowlist({
    relations: { notes: { kind: 'table', wave: 5 } },
  });
  intro.write(
    'apps/database/public-schema-allowlist.json',
    JSON.stringify(current)
  );
  assert.equal(
    run({
      cwd: intro.root,
      env: { PUBLIC_SCHEMA_BASE_SHA: intro.base },
      ...quiet,
    }),
    0
  );

  const repo = fixtureRepo({ baseAllowlist: current, baseScript: true });
  repo.write(
    'apps/database/public-schema-allowlist.json',
    JSON.stringify(
      allowlist({
        relations: {
          notes: { kind: 'table', wave: 5 },
          extra: { kind: 'table', wave: 1 },
        },
      })
    )
  );
  assert.equal(
    run({
      cwd: repo.root,
      env: { PUBLIC_SCHEMA_BASE_SHA: repo.base },
      ...quiet,
    }),
    1
  );
  repo.write(
    'apps/database/public-schema-allowlist.json',
    JSON.stringify(current)
  );
  repo.write(
    'apps/database/supabase/migrations/20991231000000_new.sql',
    'create table public.fresh (id int);\n'
  );
  assert.equal(
    run({
      cwd: repo.root,
      env: { PUBLIC_SCHEMA_BASE_SHA: repo.base },
      ...quiet,
    }),
    1
  );
});
