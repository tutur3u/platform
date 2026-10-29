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

function pgliteExecutor(db, seen = []) {
  return {
    async run(sql) {
      seen.push(sql);
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

async function report(extraSql = '', { hashesOnly = false, seen } = {}) {
  const db = await PGlite.create();
  try {
    await db.exec(FIXTURE + extraSql);
    return await collect(pgliteExecutor(db, seen), { apiSchemas, hashesOnly });
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

const REMOTE =
  'postgresql://parity_role:s3cr3t-pass@db.internal.example:6543/postgres';
const caFs = { statSync: () => ({ isFile: () => true }) };
const ENV_KEYS = [
  'LC_ALL',
  'PATH',
  'PGAPPNAME',
  'PGCONNECT_TIMEOUT',
  'PGDATABASE',
  'PGGSSENCMODE',
  'PGHOST',
  'PGOPTIONS',
  'PGPASSFILE',
  'PGPASSWORD',
  'PGPORT',
  'PGSERVICEFILE',
  'PGSSLCERT',
  'PGSSLKEY',
  'PGSSLMODE',
  'PGSSLROOTCERT',
  'PGSYSCONFDIR',
  'PGUSER',
];

test('a remote target needs --hashes-only and a pinned CA over verify-full', () => {
  assert.throws(
    () =>
      psqlInvocation({ databaseUrl: REMOTE, caFile: '/ca.pem', fsImpl: caFs }),
    /remote-target-requires-hashes-only/
  );
  assert.throws(
    () => psqlInvocation({ databaseUrl: REMOTE, hashesOnly: true }),
    /remote-target-requires-pinned-ca-file/
  );
  assert.throws(
    () =>
      psqlInvocation({
        databaseUrl: REMOTE,
        hashesOnly: true,
        caFile: '/missing-ca.pem',
        fsImpl: { statSync: () => undefined },
      }),
    /pinned-ca-file/
  );
  for (const suffix of [
    '?sslmode=disable',
    '?sslmode=verify-full',
    '?sslrootcert=system',
    '?hostaddr=10.0.0.1',
    '?host=evil.example',
    '#x',
  ]) {
    assert.throws(
      () =>
        psqlInvocation({
          databaseUrl: REMOTE + suffix,
          hashesOnly: true,
          caFile: '/ca.pem',
          fsImpl: caFs,
        }),
      /database-url-parameters-refused/,
      suffix
    );
  }
  const invocation = psqlInvocation({
    databaseUrl: REMOTE,
    hashesOnly: true,
    caFile: '/ca.pem',
    fsImpl: caFs,
  });
  assert.equal(invocation.local, false);
  assert.equal(invocation.env.PGSSLMODE, 'verify-full');
  assert.equal(invocation.env.PGSSLROOTCERT, '/ca.pem');
});

test('psql gets a minimal env, read-only options and no secrets in argv', () => {
  const inherited = {
    PGSERVICE: 'prod',
    PGHOSTADDR: '10.9.9.9',
    PGSERVICEFILE: '/home/x/.pg_service.conf',
    PGPASSFILE: '/home/x/.pgpass',
    PGSSLMODE: 'disable',
  };
  const saved = { ...process.env };
  Object.assign(process.env, inherited);
  let invocation;
  try {
    invocation = psqlInvocation({
      databaseUrl: REMOTE,
      hashesOnly: true,
      caFile: '/ca.pem',
      fsImpl: caFs,
    });
  } finally {
    for (const key of Object.keys(inherited)) {
      if (key in saved) process.env[key] = saved[key];
      else delete process.env[key];
    }
  }
  assert.deepEqual(Object.keys(invocation.env).sort(), ENV_KEYS);
  for (const key of ['PGPASSFILE', 'PGSERVICEFILE', 'PGSYSCONFDIR']) {
    assert.ok(invocation.env[key].startsWith('/nonexistent/'), key);
  }
  const argv = invocation.args.join(' ');
  for (const secret of ['s3cr3t-pass', 'db.internal.example', 'parity_role']) {
    assert.ok(!argv.includes(secret), 'argv must not carry connection details');
  }
  assert.equal(invocation.env.PGPASSWORD, 's3cr3t-pass');
  for (const option of [
    'default_transaction_read_only=on',
    'statement_timeout=60s',
    'lock_timeout=1s',
  ]) {
    assert.ok(invocation.env.PGOPTIONS.includes(`-c ${option}`), option);
  }
  const loopback = psqlInvocation({
    databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  });
  assert.equal(loopback.local, true);
  assert.equal(loopback.env.PGSSLMODE, 'disable');
  const docker = psqlInvocation({ dockerContainer: 'supabase_db_lane' });
  assert.ok(
    docker.local &&
      docker.args.includes('-i') &&
      docker.args.join(' ').includes('default_transaction_read_only=on')
  );
  assert.throws(() => psqlInvocation({ databaseUrl: 'mysql://x@y/z' }));
  assert.throws(() => psqlInvocation({ databaseUrl: 'postgres://u@a,b/db' }));
  assert.throws(() => psqlInvocation({}));
});

test('psql errors redact connection details', async () => {
  const invocation = psqlInvocation({
    databaseUrl: 'postgres://u1:pw-xyz@host-abc:5432/postgres',
    hashesOnly: true,
    caFile: '/ca.pem',
    fsImpl: caFs,
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
  assert.equal(first.checks.client_executable_definer_count.count, 0);
  assert.match(first.skippedCategories.cron_jobs, /^unavailable: cron\.job/);
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
  assert.deepEqual(variant.checks.client_executable_definer_count.offenders, [
    fn,
  ]);
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

test('EXECUTE for anon on an app definer is a must-be-zero failure', async () => {
  const variant = await report(
    'grant execute on function private.touch_note(bigint) to anon;'
  );
  assert.equal(variant.ok, false);
  assert.equal(variant.checks.null_acl_definer_count.count, 0);
  assert.deepEqual(variant.checks.client_executable_definer_count.offenders, [
    'private.touch_note(bigint)',
  ]);
});

test('definer checks are scoped to application schemas', async () => {
  const variant = await report(`
    create schema auth;
    create function auth.managed_definer() returns integer language sql
      security definer set search_path = pg_catalog, pg_temp as $$select 1$$;
  `);
  assert.equal(variant.ok, true);
  assert.equal(variant.checks.null_acl_definer_count.count, 0);
  assert.equal(variant.checks.client_executable_definer_count.count, 0);
  assert.ok(variant.categories.functions.objects['auth.managed_definer()']);
});

test('--hashes-only never reads cron.job and reports it skipped by design', async () => {
  const cron = `
    create schema cron;
    create table cron.job (jobid bigint primary key, jobname text,
      schedule text, command text, database text, username text,
      active boolean);
    insert into cron.job values
      (1, 'nightly', '0 3 * * *', 'select 1', 'postgres', 'postgres', true);
  `;
  const full = await report(cron);
  assert.equal(full.categories.cron_jobs.count, 1);
  assert.deepEqual(full.skippedCategories, {});
  const seen = [];
  const prod = await report(cron, { hashesOnly: true, seen });
  assert.ok(seen.every((sql) => !/from cron\.job/.test(sql)));
  assert.match(prod.skippedCategories.cron_jobs, /^by-design:/);
  const diff = compareReports(full, prod);
  assert.equal(diff.equal, true);
  assert.deepEqual(diff.skippedCategories, ['cron_jobs']);
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
