import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import {
  buildReport,
  CONFIG_PATH,
  collect,
  compareReports,
  createPsqlExecutor,
  hashesOnly,
  loadQueries,
  parseLines,
  psqlInvocation,
  readApiSchemas,
  wrapReadOnly,
} from './verify-declarative-parity.mjs';

const apiSchemas = readApiSchemas(fs.readFileSync(CONFIG_PATH, 'utf8'));
const MFA_QUAL = 'account_required_mfa_satisfied';

// A small schema with the shapes the pack must police: a restrictive MFA policy,
// a revoked-and-granted definer and column-level grants.
const FIXTURE = `
create role anon nologin; create role authenticated nologin;
create role service_role nologin;
create schema private;
revoke create on schema public from public;
grant usage on schema public to anon, authenticated, service_role;
create function public.${MFA_QUAL}() returns boolean language sql stable
  set search_path = pg_catalog, pg_temp as $$select true$$;
revoke all on function public.${MFA_QUAL}() from public, anon, authenticated;
grant execute on function public.${MFA_QUAL}() to authenticated;
create table public.notes (id bigint primary key, title text, body text);
alter table public.notes enable row level security;
create policy notes_read on public.notes for select to authenticated
  using (title is not null);
create policy account_required_mfa on public.notes as restrictive for all
  to authenticated using ((select public.${MFA_QUAL}()))
  with check ((select public.${MFA_QUAL}()));
revoke all on table public.notes from public, anon, authenticated;
grant select on table public.notes to authenticated;
create function private.touch_note(note_id bigint) returns void
  language sql security definer set search_path = pg_catalog, pg_temp
  as $$select$$;
revoke all on function private.touch_note(bigint) from public, anon, authenticated;
grant execute on function private.touch_note(bigint) to service_role;
`;

function pgliteExecutor(db) {
  return {
    async run(sql) {
      const results = await db.exec(sql);
      return results
        .filter(
          (result) =>
            result.fields.map((f) => f.name).join() ===
            'kind,category,identity,value'
        )
        .flatMap((result) =>
          result.rows.map((row) =>
            [row.kind, row.category, row.identity, row.value].join('\t')
          )
        );
    },
  };
}

async function report(extraSql = '') {
  const db = await PGlite.create();
  try {
    await db.exec(FIXTURE + extraSql);
    return await collect(pgliteExecutor(db), { apiSchemas });
  } finally {
    await db.close();
  }
}

const baseline = report();

test('derives API schemas from config.toml', () => {
  assert.ok(apiSchemas.includes('public'));
  assert.ok(apiSchemas.includes('private'));
  assert.throws(() => readApiSchemas('[api]\nschemas = ["Bad-Name"]\n'));
});

test('every query is one read-only SELECT with the shared column shape', () => {
  const queries = loadQueries();
  assert.ok(queries.length >= 10);
  for (const { name, sql } of queries) {
    const code = sql
      .replace(/--[^\n]*/g, '')
      .replace(/'(?:[^']|'')*'/g, "''")
      .replace(/\$\$[\s\S]*?\$\$/g, '');
    assert.equal(code.split(';').length, 2, `${name}: exactly one statement`);
    assert.match(
      code.trim(),
      /^(with|select)\b/i,
      `${name}: starts as a query`
    );
    assert.match(code, /as kind\b[\s\S]*as category\b[\s\S]*as value\b/, name);
    assert.doesNotMatch(
      code,
      /\b(insert|update|delete|merge|create|alter|drop|grant|revoke|truncate|copy|call|do|set_config|pg_read_file|pg_ls_dir|lo_\w+|dblink\w*|nextval|setval|pg_terminate_backend)\b/i,
      `${name}: no writes or side effects`
    );
  }
  const all = queries.map(({ sql }) => sql).join('\n');
  for (const category of [
    'relations',
    'columns',
    'constraints',
    'indexes',
    'functions',
    'policies',
    'restrictive_policies',
    'acl_relations',
    'acl_columns',
    'acl_schemas',
    'acl_functions',
    'default_privileges',
    'probe_functions',
    'probe_tables',
    'probe_columns',
    'probe_schemas',
    'triggers',
    'event_triggers',
    'extensions',
    'publications',
    'publication_tables',
    'cron_jobs',
    'types',
  ]) {
    assert.match(all, new RegExp(`'${category}'`), `category ${category}`);
  }
});

test('wraps every run in a read-only, time-bounded transaction', () => {
  const sql = wrapReadOnly('select 1;', ['public']);
  assert.match(
    sql,
    /^begin transaction isolation level repeatable read read only;/
  );
  assert.match(sql, /set local statement_timeout = '60s';/);
  assert.match(sql, /set local lock_timeout = '1s';/);
  assert.match(sql, /rollback;\n$/);
  assert.throws(() => wrapReadOnly('select 1;', ["public'; drop table x; --"]));
});

test('psql keeps the URL out of argv and forces read-only session options', () => {
  const url =
    'postgresql://parity_role:s3cr3t-pass@db.internal.example:6543/postgres?sslmode=require';
  const invocation = psqlInvocation({ databaseUrl: url });
  const argv = invocation.args.join(' ');
  for (const secret of [
    's3cr3t-pass',
    'db.internal.example',
    'parity_role',
    url,
  ]) {
    assert.ok(!argv.includes(secret), 'argv must not carry connection details');
  }
  assert.equal(invocation.env.PGPASSWORD, 's3cr3t-pass');
  assert.equal(invocation.env.PGSSLMODE, 'require');
  for (const option of [
    'default_transaction_read_only=on',
    'statement_timeout=60s',
    'lock_timeout=1s',
  ]) {
    assert.ok(invocation.env.PGOPTIONS.includes(`-c ${option}`), option);
  }
  const docker = psqlInvocation({ dockerContainer: 'supabase_db_lane' });
  assert.ok(
    docker.args.includes('-i') &&
      docker.args.join(' ').includes('default_transaction_read_only=on')
  );
  assert.throws(() => psqlInvocation({ databaseUrl: 'mysql://x@y/z' }));
  assert.throws(() => psqlInvocation({}));
});

test('psql errors redact connection details', async () => {
  const invocation = psqlInvocation({
    databaseUrl: 'postgres://u1:pw-xyz@host-abc:5432/postgres',
  });
  const executor = createPsqlExecutor(invocation, () => ({
    status: 2,
    stderr: 'connection to host-abc failed for user u1 password pw-xyz',
  }));
  await assert.rejects(executor.run('select 1;'), (error) => {
    assert.ok(!/host-abc|pw-xyz|\bu1\b/.test(error.message));
    return true;
  });
});

test('rejects any output that is not an identity, digest or count', () => {
  const definition = `O\tpolicies\tpublic.notes.p\t(select ${MFA_QUAL}())`;
  assert.throws(
    () => parseLines([definition]),
    (error) => {
      assert.match(error.message, /unexpected-output-shape: line 1/);
      assert.ok(
        !error.message.includes(MFA_QUAL),
        'error must not echo content'
      );
      return true;
    }
  );
  assert.throws(() => parseLines(['M\tnull_acl_definer_count\t\tmany']));
  assert.throws(() => parseLines(['O\trelations\tx\ty\tz']));
  assert.throws(() => parseLines([`X\trelations\tx\t${'a'.repeat(64)}`]));
  const row = `O\trelations\tr:public.a\t${'a'.repeat(64)}`;
  assert.throws(
    () => buildReport(parseLines([row, row]), { apiSchemas }),
    /duplicate-identity/
  );
});

test('two runs of the same schema produce identical hashes', async () => {
  const [first, second] = [await baseline, await report()];
  assert.deepEqual(second, first);
  assert.equal(first.ok, true);
  assert.equal(first.checks.null_acl_definer_count.count, 0);
  assert.equal(first.checks.unsafe_definer_search_path_count.count, 0);
  assert.equal(first.metrics.restrictive_mfa_policy_count, 1);
  assert.deepEqual(first.skippedCategories, ['cron']);
  assert.ok(first.categories.probe_columns.objects['public.notes.title']);
});

test('a definer recreated with a NULL proacl fails the count and the anon probe', async () => {
  const variant = await report(`
    drop function private.touch_note(bigint);
    create function private.touch_note(note_id bigint) returns void
      language sql security definer set search_path = pg_catalog, pg_temp
      as $$select$$;
  `);
  const fn = 'private.touch_note(bigint)';
  assert.equal(variant.ok, false);
  assert.equal(variant.checks.null_acl_definer_count.count, 1);
  assert.deepEqual(variant.checks.null_acl_definer_count.offenders, [fn]);
  assert.equal(variant.metrics.public_execute_definer_count, 1);
  const diff = compareReports(await baseline, variant);
  assert.deepEqual(diff.categories.probe_functions.changed, [fn]);
  assert.deepEqual(diff.categories.acl_functions.changed, [fn]);
});

test('a dropped account_required_mfa policy fails the restrictive category', async () => {
  const variant = await report(
    'drop policy account_required_mfa on public.notes;'
  );
  assert.equal(variant.metrics.restrictive_mfa_policy_count, 0);
  const diff = compareReports(await baseline, variant);
  assert.deepEqual(diff.categories.restrictive_policies.missing, [
    'public.notes.account_required_mfa',
  ]);
  assert.equal(diff.equal, false);
});

test('a column grant to anon fails has_column_privilege', async () => {
  const variant = await report('grant select (title) on public.notes to anon;');
  const diff = compareReports(await baseline, variant);
  assert.deepEqual(diff.categories.probe_columns.changed, [
    'public.notes.title',
  ]);
  assert.deepEqual(diff.categories.acl_columns.unexpected, [
    'public.notes.title',
  ]);
  assert.equal(diff.metrics.anon_column_privilege_count.actual, 1);
});

test('an unsafe definer search_path is counted and named', async () => {
  const variant = await report(
    'alter function private.touch_note(bigint) set search_path = public;'
  );
  assert.equal(variant.ok, false);
  assert.deepEqual(variant.checks.unsafe_definer_search_path_count.offenders, [
    'private.touch_note(bigint)',
  ]);
});

test('--hashes-only output carries no per-object map or definition text', async () => {
  const output = hashesOnly(await baseline);
  const text = JSON.stringify(output);
  for (const forbidden of [
    MFA_QUAL,
    'title is not null',
    'pg_catalog, pg_temp',
    '"objects"',
  ]) {
    assert.ok(!text.includes(forbidden), `must not include ${forbidden}`);
  }
  assert.deepEqual(Object.keys(output).sort(), [
    'apiSchemas',
    'categories',
    'checks',
    'format',
    'metrics',
    'mode',
    'ok',
    'serverVersionNum',
    'sha256',
    'skippedCategories',
  ]);
  for (const category of Object.values(output.categories)) {
    assert.deepEqual(Object.keys(category).sort(), ['count', 'sha256']);
  }
  // The full report names objects but still never carries definitions.
  assert.ok(!JSON.stringify(await baseline).includes('title is not null'));
});
