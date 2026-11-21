import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const history = 'apps/supermemory/db';
const receiptsPath = `${history}/production-receipts.json`;
const commitPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const ledger = 'memory_worker_migrations.applied';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      env: { PATH: process.env.PATH },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    });
  } catch {
    throw new Error('Unable to verify the pinned Git source or its ancestry');
  }
}

export function loadHistory({ source, trusted, cwd }) {
  requireCondition(
    commitPattern.test(source) && commitPattern.test(trusted),
    'Full lowercase commit SHAs are required'
  );
  requireCondition(
    git(['rev-parse', 'HEAD'], cwd).toString().trim() === trusted,
    'Checkout does not match the trusted dispatch SHA'
  );
  requireCondition(
    git(['cat-file', '-t', source], cwd).toString().trim() === 'commit',
    'Pinned source must be a commit'
  );
  git(['merge-base', '--is-ancestor', source, trusted], cwd);

  const read = (commit, path) => git(['show', `${commit}:${path}`], cwd);
  const manifest = read(trusted, receiptsPath);
  requireCondition(
    manifest.equals(read(source, receiptsPath)),
    'Pinned source has a different production receipt history'
  );

  const { baseline, migration } = JSON.parse(manifest);
  for (const [receipt, file] of [
    [baseline, '001_schema.sql'],
    [migration, '002_worker.sql'],
  ]) {
    requireCondition(
      receipt?.file === file && digestPattern.test(receipt.sha256),
      'Invalid production migration receipt'
    );
    requireCondition(
      sha256(read(source, `${history}/${file}`)) === receipt.sha256,
      `SQL digest mismatch for ${file}`
    );
  }

  const sql = read(source, `${history}/${migration.file}`).toString('utf8');
  const envelope = /^begin;\n([\s\S]+)\ncommit;\n$/;
  const body = envelope.exec(sql)?.[1];
  requireCondition(
    body,
    'Migration is missing its reviewed transaction envelope'
  );
  return { source, baseline, migration, body };
}

const markers = {
  schema: "to_regnamespace('memory_worker') is not null",
  caller:
    "exists (select 1 from pg_attribute where attrelid = to_regclass('public.memories') and attname = 'worker_caller' and not attisdropped)",
  revision:
    "exists (select 1 from pg_attribute where attrelid = to_regclass('public.memories') and attname = 'worker_revision' and not attisdropped)",
  scope:
    "exists (select 1 from pg_constraint where conrelid = to_regclass('public.memories') and conname = 'memories_worker_scope_check' and convalidated)",
  role: "exists (select 1 from pg_roles where rolname = 'memory_worker_runtime')",
  runtimeOnly:
    "exists (select 1 from pg_roles where rolname = 'memory_worker_runtime' and not (rolcanlogin or rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls))",
  epoch: "to_regprocedure('memory_worker.advance_epoch()') is not null",
  epochTrigger:
    "exists (select 1 from pg_trigger where tgrelid = to_regclass('memory_worker.admission') and tgname = 'advance_epoch' and tgenabled = 'O')",
};
for (const name of [
  'public.memories_worker_custom_id_idx',
  'public.memories_worker_tag_idx',
  'memory_worker.admission',
  'memory_worker.retired_ids',
  'memory_worker.retired_tags',
  'memory_worker.purge_receipts',
]) {
  markers[name] = `to_regclass('${name}') is not null`;
}

const snapshot = String.raw`
select to_regclass('${ledger}') is not null as has_ledger \gset
\if :has_ledger
  select coalesce(jsonb_agg(to_jsonb(receipt)), '[]'::jsonb) as receipts
  from (
    select version, sha256, source_sha, plan_sha256, applied_at
    from ${ledger} order by version limit 2
  ) receipt \gset
\else
  \set receipts '[]'
\endif
select jsonb_build_object(
  'database', current_database(),
  'oid', (select oid::text from pg_database where datname = current_database()),
  'baseline', exists (
    select 1 from pg_attribute
    where attrelid = to_regclass('public.memories')
      and attname = 'embedding' and attnotnull and not attisdropped
      and atttypid = to_regtype('extensions.halfvec') and atttypmod = 3072
  ) and exists (
    select 1 from pg_extension where extname = 'vector'
      and extnamespace = to_regnamespace('extensions')
  ),
  'ledgerSchema', to_regnamespace('memory_worker_migrations') is not null,
  'hasLedger', :'has_ledger'::boolean,
  'receipts', :'receipts'::jsonb,
  'markers', jsonb_build_object(${Object.entries(markers)
    .map(([key, expression]) => `'${key}', ${expression}`)
    .join(',\n')})
) as snapshot \gset
`;

const sessionSettings = `
set local search_path = pg_catalog;
set local time zone 'UTC';
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '10s';
`;

function readState(psql) {
  const output = psql(
    'read-only migration snapshot',
    String.raw`begin isolation level repeatable read read only;
${sessionSettings}
${snapshot}
select :'snapshot';
commit;
`
  );
  try {
    return JSON.parse(output);
  } catch {
    throw new Error('Postgres returned an invalid migration snapshot');
  }
}

function validatedReceipt(state, database, migration) {
  requireCondition(
    state.database === database && /^\d+$/.test(state.oid) && state.baseline,
    'Memory database identity or pgvector baseline does not match'
  );
  const values = Object.values(state.markers);
  const [receipt] = state.receipts;
  if (!state.ledgerSchema && !state.hasLedger && state.receipts.length === 0) {
    requireCondition(
      values.every((present) => present === false),
      'Untracked Worker schema or role exists'
    );
    return null;
  }

  requireCondition(
    state.ledgerSchema &&
      state.hasLedger &&
      state.receipts.length === 1 &&
      receipt.version === migration.file &&
      receipt.sha256 === migration.sha256 &&
      commitPattern.test(receipt.source_sha) &&
      digestPattern.test(receipt.plan_sha256) &&
      Number.isFinite(Date.parse(receipt.applied_at)) &&
      values.every((present) => present === true),
    'Migration history or Worker schema drift'
  );
  return receipt;
}

export function createPsql(connection) {
  return (step, input) => {
    const result = spawnSync(
      'psql',
      [
        '--no-psqlrc',
        '--no-password',
        '--quiet',
        '--no-align',
        '--tuples-only',
        '--set=ON_ERROR_STOP=1',
      ],
      {
        input,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, ...connection },
        timeout: 240_000,
        maxBuffer: 64 * 1024,
      }
    );
    requireCondition(
      result.status === 0,
      `Postgres failed during ${step} (exit ${result.status ?? 'unavailable'})`
    );
    return result.stdout.trim();
  };
}

export function validateMode(mode, expected) {
  requireCondition(
    (mode === 'list_only' && !expected) ||
      (mode === 'apply' && digestPattern.test(expected)),
    'Apply requires the plan SHA-256 from list_only'
  );
}

export function runMigration({
  history: pinned,
  connection,
  psql,
  mode,
  expected,
}) {
  validateMode(mode, expected);
  const { source, baseline, migration, body } = pinned;
  const state = readState(psql);
  const receipt = validatedReceipt(state, connection.PGDATABASE, migration);
  const plan = {
    source,
    target: sha256(
      JSON.stringify([
        connection.PGHOST,
        connection.PGPORT,
        state.database,
        state.oid,
      ])
    ),
    baseline,
    applied: receipt ? [receipt] : [],
    pending: receipt ? [] : [migration],
  };
  const planSha256 = sha256(JSON.stringify(plan));
  if (mode === 'list_only') return { mode, ...plan, planSha256 };

  requireCondition(
    expected === planSha256 ||
      (receipt?.source_sha === source && expected === receipt.plan_sha256),
    'The approved plan does not match. Run list_only again.'
  );
  if (receipt) return { mode, outcome: 'already_applied', receipt };

  // The pinned SQL and its receipt must commit together.
  const expectedState = JSON.stringify(state).replaceAll("'", "''");
  psql(
    'atomic migration',
    String.raw`begin;
${sessionSettings}
select pg_advisory_xact_lock(1095911501, 1);
lock table public.memories in access exclusive mode;
${snapshot}
select :'snapshot'::jsonb = '${expectedState}'::jsonb as approved \gset
\if :approved
\else
  do $$begin raise exception 'Approved state changed'; end$$;
\endif

${body}

select
  (select count(*) = 2 and bool_and(stopped and epoch = 0 and remaining = 0 and revision = 0)
   from memory_worker.admission where caller in ('assistant', 'people-registry'))
   and (select count(*) = 2 from memory_worker.admission) as callers_stopped \gset
\if :callers_stopped
\else
  do $$begin raise exception 'Initial caller admission must be stopped'; end$$;
\endif

create schema memory_worker_migrations;
revoke all on schema memory_worker_migrations from public;
create table ${ledger} (
  version text primary key,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  source_sha text not null check (source_sha ~ '^[a-f0-9]{40}$'),
  plan_sha256 text not null check (plan_sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz not null default now()
);
revoke all on table ${ledger} from public;
insert into ${ledger} (version, sha256, source_sha, plan_sha256)
values ('${migration.file}', '${migration.sha256}', '${source}', '${planSha256}');
commit;
`
  );

  const committed = readState(psql);
  const readback = validatedReceipt(
    committed,
    connection.PGDATABASE,
    migration
  );
  requireCondition(
    committed.oid === state.oid &&
      readback?.source_sha === source &&
      readback.plan_sha256 === planSha256,
    'Post-commit migration readback does not match the applied plan'
  );
  return { mode, outcome: 'applied', receipt: readback };
}

function productionConnection(env) {
  const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = env;
  const identifier = /^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/;
  requireCondition(
    PGHOST &&
      /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(PGHOST) &&
      /^\d{1,5}$/.test(PGPORT ?? '') &&
      Number(PGPORT) > 0 &&
      Number(PGPORT) <= 65535 &&
      PGDATABASE &&
      identifier.test(PGDATABASE) &&
      PGUSER &&
      identifier.test(PGUSER) &&
      PGPASSWORD,
    'Protected memory database connection settings are incomplete'
  );
  return {
    PGHOST,
    PGPORT,
    PGDATABASE,
    PGUSER,
    PGPASSWORD,
    PGCONNECT_TIMEOUT: '5',
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: 'system',
  };
}

function main(env, phase) {
  requireCondition(
    env.GITHUB_ACTIONS === 'true' &&
      env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
      env.GITHUB_REPOSITORY === 'tutur3u/platform' &&
      env.GITHUB_REF === 'refs/heads/main',
    'Production memory migrations require an Actions dispatch from main'
  );
  const mode = env.MEMORY_DB_MODE;
  const expected = env.MEMORY_DB_EXPECTED_PLAN_SHA256;
  validateMode(mode, expected);
  const pinned = loadHistory({
    source: env.MEMORY_DB_SOURCE_SHA,
    trusted: env.GITHUB_SHA,
  });
  if (phase === 'verify-source') {
    console.log(`Verified pinned memory migration source ${pinned.source}`);
    return;
  }
  requireCondition(phase === 'database', 'Unknown runner phase');
  const connection = productionConnection(env);
  const result = runMigration({
    history: pinned,
    connection,
    psql: createPsql(connection),
    mode,
    expected,
  });
  const json = JSON.stringify(result, null, 2);
  console.log(json);
  appendFileSync(
    env.GITHUB_STEP_SUMMARY,
    `\n\x60\x60\x60json\n${json}\n\x60\x60\x60\n`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main(process.env, process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
