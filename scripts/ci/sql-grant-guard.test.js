const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const {
  MIGRATION_CUTOFF,
  RULES,
  checkRepository,
  evaluateSqlFiles,
  formatLegacyReport,
  scanSql,
} = require('./sql-grant-guard');

const MIGRATION =
  'apps/database/supabase/migrations/20261101000000_example.sql';
const ROLLBACK = 'apps/database/rollbacks/20261101000000_example.rollback.sql';

function evaluate(fixtures) {
  return evaluateSqlFiles({
    files: Object.keys(fixtures),
    readFile: (file) => fixtures[file],
  });
}

function grants(sql) {
  return scanSql(sql, { definerRule: false });
}

function definers(sql) {
  return scanSql(sql, { definerRule: true }).filter(
    (finding) => finding.rule === RULES.definerPublic
  );
}

test('the migration cutoff is pinned to the rule adoption date', () => {
  assert.equal(MIGRATION_CUTOFF, '20261028000000');
});

test('the repository adds no public or anon grant after the cutoff', () => {
  assert.deepEqual(
    checkRepository().violations.map((violation) => violation.message),
    []
  );
});

test('the legacy report counts findings before the cutoff', () => {
  const { legacy } = checkRepository();
  assert.ok(legacy.length > 0);
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'sql-grant-guard.js'), '--report'],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    new RegExp(`not enforced\\): ${legacy.length}\\n`)
  );
  assert.match(result.stdout, /anon-grant: \d+ in \d+ files/);
  assert.match(result.stdout, /definer-public: \d+ in \d+ files/);
});

test('a rollback re-granting EXECUTE to public and service_role fails', () => {
  const { violations } = evaluate({
    [ROLLBACK]: [
      '-- Restore the previous grants.',
      'grant execute on function public.get_user_sessions(uuid) to public, service_role;',
    ].join('\n'),
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, RULES.anonGrant);
  assert.match(violations[0].message, /rollback\.sql:2 grants to public\./);
});

test('a rollback re-granting EXECUTE to anon and authenticated fails', () => {
  const { violations } = evaluate({
    [ROLLBACK]:
      'GRANT EXECUTE ON FUNCTION public.list_finance_rows(uuid, text) TO anon, authenticated;\n',
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /grants to anon\./);
});

test('table, view and multi-line grants are matched case-insensitively', () => {
  const findings = grants(
    [
      'create table public.example (id uuid);',
      'Grant SELECT, insert',
      '  ON TABLE public.example',
      '  TO "anon";',
      'grant select on public.example_view to Public with grant option;',
      'grant usage on schema public to authenticated;',
    ].join('\n')
  );
  assert.deepEqual(
    findings.map((finding) => [finding.line, finding.detail]),
    [
      [2, 'grants to anon'],
      [5, 'grants to public'],
    ]
  );
});

test('grants to authenticated or service_role on public objects pass', () => {
  assert.deepEqual(
    grants(
      [
        'grant execute on function public.f(uuid) to authenticated, service_role;',
        'grant select on table public.anon_events to service_role;',
        'revoke all on function public.f(uuid) from public, anon;',
        'alter default privileges in schema public revoke execute on functions from anon;',
      ].join('\n')
    ),
    []
  );
});

test('alter default privileges granting to anon or public fails', () => {
  const findings = grants(
    [
      'alter default privileges in schema public',
      '  grant execute on functions to anon;',
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON TABLES TO PUBLIC;',
    ].join('\n')
  );
  assert.deepEqual(
    findings.map((finding) => finding.line),
    [1, 3]
  );
});

test('allow-anon-grant exempts on the same or preceding line with a reason', () => {
  const sql = [
    'grant select on public.a to anon; -- allow-anon-grant: public catalog',
    '-- allow-anon-grant: health probe reads it',
    'grant select on public.b to anon;',
    '-- allow-anon-grant: too far away',
    '',
    'grant select on public.c to anon;',
    '-- allow-anon-grant:',
    'grant select on public.d to anon;',
    'grant select',
    '  on public.e',
    '  to anon; -- allow-anon-grant: multi-line statement',
  ].join('\n');
  assert.deepEqual(
    grants(sql).map((finding) => finding.line),
    [6, 8]
  );
});

test('GRANT text in comments, literals and dollar-quoted bodies is ignored', () => {
  const sql = [
    '-- grant execute on function public.f() to anon;',
    '/* grant select on public.t to public; /* nested */ still a comment',
    '   grant select on public.t to anon; */',
    "comment on table public.t is 'grant select on public.t to anon; see docs';",
    "select E'it\\'s fine; grant select on public.t to anon';",
    'do $$',
    'begin',
    "  execute 'grant select on public.t to anon';",
    '  grant select on public.t to public;',
    'end;',
    '$$;',
    'create function public.g() returns void language plpgsql as $body$',
    'begin',
    '  grant select on public.t to anon;',
    'end;',
    '$body$;',
    'revoke all on function public.g() from public, anon;',
  ].join('\n');
  assert.deepEqual(grants(sql), []);
});

test('a SECURITY DEFINER function without a revoke fails', () => {
  const { violations } = evaluate({
    [MIGRATION]: [
      'create or replace function public.get_workspace_secret(p_ws_id uuid)',
      'returns text',
      'language plpgsql',
      'security definer',
      "set search_path = ''",
      'as $$',
      'begin',
      '  return (select value from public.workspace_secrets where ws_id = p_ws_id);',
      'end;',
      '$$;',
      'grant execute on function public.get_workspace_secret(uuid) to authenticated;',
    ].join('\n'),
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, RULES.definerPublic);
  assert.match(
    violations[0].message,
    /:1 creates SECURITY DEFINER function public\.get_workspace_secret\(uuid\) without revoking EXECUTE from public, anon\./
  );
});

test('a matching revoke from public and anon satisfies the definer rule', () => {
  const sql = [
    'CREATE FUNCTION "public"."f"(p_ws_id uuid, p_limit int DEFAULT 10, OUT total bigint)',
    'RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$ select 1::bigint $$;',
    'REVOKE ALL ON FUNCTION public.f(uuid, integer) FROM PUBLIC;',
    'revoke execute on function public.f(uuid, int4) from anon;',
    'create function g(at timestamptz, ratio double precision) returns void',
    '  language sql security definer as $$ select $$;',
    'revoke all on function public.g(timestamp with time zone, float8), public.h(uuid) from public, anon;',
  ].join('\n');
  assert.deepEqual(definers(sql), []);
});

test('a revoke from public only, or for another signature, still fails', () => {
  const sql = [
    'create function public.f(p uuid) returns void language sql security definer as $$ select $$;',
    'revoke all on function public.f(uuid) from public;',
    'create function public.g(p uuid) returns void language sql security definer as $$ select $$;',
    'revoke all on function public.g(text) from public, anon;',
  ].join('\n');
  assert.deepEqual(
    definers(sql).map((finding) => finding.detail),
    [
      'creates SECURITY DEFINER function public.f(uuid) without revoking EXECUTE from anon',
      'creates SECURITY DEFINER function public.g(uuid) without revoking EXECUTE from public, anon',
    ]
  );
});

test('allow-definer-public exempts a definer function', () => {
  const sql = [
    '-- allow-definer-public: login helper must run before sign-in',
    'create function public.f() returns void language sql security definer as $$ select $$;',
  ].join('\n');
  assert.deepEqual(definers(sql), []);
});

test('invoker functions and definer text in bodies or comments pass', () => {
  const sql = [
    '-- security definer',
    'create function public.f() returns void language plpgsql security invoker as $$',
    'begin',
    "  raise notice 'security definer';",
    'end;',
    '$$;',
    'create function public.g() returns text language sql as $$ select $q$security definer$q$ $$;',
  ].join('\n');
  assert.deepEqual(definers(sql), []);
});

test('the definer rule applies to migrations, not rollbacks', () => {
  const definer =
    'create function public.f() returns void language sql security definer as $$ select $$;';
  const { violations } = evaluate({
    [MIGRATION]: definer,
    [ROLLBACK]: definer,
  });
  assert.deepEqual(
    violations.map((violation) => violation.file),
    [MIGRATION]
  );
});

test('files before the cutoff are reported as legacy, not enforced', () => {
  const grant = 'grant select on public.t to anon;';
  const { violations, legacy } = evaluate({
    'apps/database/supabase/migrations/20261027235959_old.sql': grant,
    'apps/database/rollbacks/20261027140000_old.rollback.sql': grant,
    'apps/database/supabase/migrations/20261028000000_new.sql': grant,
    'apps/database/rollbacks/unversioned.sql': grant,
    'apps/database/supabase/seed.sql': grant,
  });
  assert.deepEqual(
    violations.map((violation) => violation.file),
    [
      'apps/database/supabase/migrations/20261028000000_new.sql',
      'apps/database/rollbacks/unversioned.sql',
    ]
  );
  assert.equal(legacy.length, 2);
  assert.match(
    formatLegacyReport(legacy),
    /\(not enforced\): 2\n {2}anon-grant: 2 in 2 files\n {2}definer-public: 0 in 0 files/
  );
});
