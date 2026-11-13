import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  migrate,
  preflight,
  parseLedger,
  connection,
  PROJECT,
  CLI,
  SQL_HASH,
  VERSIONS,
} from './production-migration-only.mjs';

const sha = 'a'.repeat(40),
  control = 'b'.repeat(40);
const sql = fs.readFileSync(
  new URL('./production-migration-option-a-postcheck.sql', import.meta.url)
);
const versions = ['20230202082703', ...VERSIONS];
const env = () => ({
  GITHUB_REPOSITORY: 'tutur3u/platform',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_SHA: control,
  EXPECTED_SHA: sha,
  EXPECTED_PROJECT_REF: PROJECT,
  PRODUCTION_PROJECT_ID: PROJECT,
  BACKUP_RECEIPT_SHA256: 'c'.repeat(64),
  EXPECTED_PENDING_VERSIONS: JSON.stringify(VERSIONS),
  GITHUB_STEP_SUMMARY: '/summary',
  SUPABASE_ACCESS_TOKEN: 'fixture',
  SUPABASE_DB_PASSWORD: 'fixture',
});
const time = (v) =>
  `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)} ${v.slice(8, 10)}:${v.slice(10, 12)}:${v.slice(12, 14)}`;
function table(pending = VERSIONS, list = versions) {
  return (
    '  Local | Remote | Time (UTC)\n -------|--------|----------------------\n' +
    list
      .map((v) => ` ${v} | ${pending.includes(v) ? '' : v} | ${time(v)}`)
      .join('\n') +
    '\n'
  );
}
function fixture(options = {}) {
  const calls = [],
    summaries = [];
  let lists = 0,
    fences = 0;
  const config = { ...env(), ...options.env };
  const io = {
    readFileSync(file) {
      if (file.endsWith('.sql'))
        return options.badSQL ? Buffer.from('altered') : sql;
      if (file.endsWith('/project-ref')) return options.linkProject ?? PROJECT;
      if (file.endsWith('/pooler-url'))
        return (
          options.dsn ??
          `postgresql://postgres.${PROJECT}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
        );
      throw Error('Unexpected read');
    },
    appendFileSync(_file, value) {
      summaries.push(value);
    },
    readdirSync() {
      return (options.local ?? versions).map((v) => ({
        name: `${v}_fixture.sql`,
        isFile: () => true,
      }));
    },
  };
  const run = (cmd, args, opts = {}) => {
    const key = [cmd, ...args].join(' ');
    calls.push({ cmd, args, opts, key });
    if (options.failAt && key.includes(options.failAt))
      throw Error('Injected command failure');
    let stdout = '';
    if (cmd === 'gh')
      stdout =
        options.productionByCall?.[fences++] ?? options.production ?? sha;
    if (cmd === 'git')
      stdout = opts.cwd.endsWith('apps/database')
        ? (options.source ?? sha)
        : control;
    if (key === 'supabase --version') stdout = options.cli ?? CLI;
    if (cmd === 'psql' && args.includes('-c')) stdout = '1';
    if (key === 'supabase migration list --linked')
      stdout = lists++
        ? (options.after ?? table([]))
        : (options.before ?? table());
    return { stdout, stderr: 'not merged into stdout' };
  };
  return {
    config,
    io,
    calls,
    summaries,
    run,
    go: () => migrate({ env: config, run, io, root: '/control' }),
  };
}
const pushes = (f) =>
  f.calls.filter((c) => c.key === 'supabase db push --include-all');

test('exact thirteen apply once, fresh ledger, read-only SQL, summary and manual poststeps', () => {
  const f = fixture();
  f.go();
  assert.equal(pushes(f).length, 1);
  const keys = f.calls.map((c) => c.key);
  const fence =
    'gh api repos/tutur3u/platform/git/ref/heads/production --jq .object | if .type == \"commit\" then .sha else \"\" end';
  assert.deepEqual(keys, [
    fence,
    'git rev-parse HEAD',
    'git rev-parse HEAD',
    'supabase --version',
    'psql --version',
    `supabase link --project-ref ${PROJECT}`,
    'psql -X -v ON_ERROR_STOP=1 -A -t -c SELECT 1',
    'supabase migration list --linked',
    fence,
    'supabase db push --include-all',
    'supabase migration list --linked',
    fence,
    'psql -X -v ON_ERROR_STOP=1 -f /control/scripts/ci/production-migration-option-a-postcheck.sql',
  ]);
  const push = keys.indexOf('supabase db push --include-all');
  assert(keys.indexOf('psql -X -v ON_ERROR_STOP=1 -A -t -c SELECT 1') < push);
  assert.equal(
    keys.filter((s) => s === 'supabase migration list --linked').length,
    2
  );
  assert(
    keys
      .at(-1)
      .includes(
        'psql -X -v ON_ERROR_STOP=1 -f /control/scripts/ci/production-migration-option-a-postcheck.sql'
      )
  );
  assert.equal(f.calls.at(-1).opts.env.PGPASSWORD, 'fixture');
  assert.equal(f.calls.at(-1).opts.env.PGSSLMODE, 'require');
  assert.match(f.calls.at(-1).opts.env.PGOPTIONS, /read_only=on/);
  assert.match(f.summaries.at(-1), /SQL AND LEDGER PASSED/);
  assert.match(f.summaries.at(-1), /MANUAL TTR/);
  assert.match(f.summaries.at(-1), new RegExp('c'.repeat(64)));
});

for (const [label, changes] of Object.entries({
  emptyBackup: { BACKUP_RECEIPT_SHA256: '' },
  malformedBackup: { BACKUP_RECEIPT_SHA256: 'A'.repeat(64) },
  sha: { EXPECTED_SHA: 'main' },
  project: { EXPECTED_PROJECT_REF: 'other' },
  binding: { PRODUCTION_PROJECT_ID: 'other' },
  fork: { GITHUB_REPOSITORY: 'fork/platform' },
  branch: { GITHUB_REF: 'refs/heads/production' },
  event: { GITHUB_EVENT_NAME: 'pull_request' },
  missing: { EXPECTED_PENDING_VERSIONS: JSON.stringify(VERSIONS.slice(1)) },
  extra: {
    EXPECTED_PENDING_VERSIONS: JSON.stringify([...VERSIONS, '20261112133001']),
  },
  duplicate: {
    EXPECTED_PENDING_VERSIONS: JSON.stringify([
      ...VERSIONS.slice(1),
      VERSIONS[1],
    ]),
  },
  numeric: { EXPECTED_PENDING_VERSIONS: JSON.stringify(VERSIONS.map(Number)) },
  malformed: { EXPECTED_PENDING_VERSIONS: '[] garbage' },
})) {
  test(`${label} input fails before any command`, () => {
    const f = fixture({ env: changes });
    assert.throws(f.go);
    assert.equal(f.calls.length, 0);
  });
}

const badTables = {
  missing: table(VERSIONS.slice(1)),
  extra: table([...VERSIONS, versions[0]]),
  duplicate: table(VERSIONS, [...versions, VERSIONS.at(-1)]),
  truncated: table(VERSIONS, versions.slice(0, -1)),
  malformed: table().replace(VERSIONS[0], 'not-a-version'),
  orphan: table() + ` | 20261112133001 | ${time('20261112133001')}\n`,
  warning: 'warning unknown output\n' + table(),
  unknownTime: table().replace('2023-02-02 08:27:03', 'unknown'),
  json: '[]',
};
for (const [label, before] of Object.entries(badTables)) {
  test(`${label} actual ledger refuses before apply`, () => {
    const f = fixture({ before });
    assert.throws(f.go);
    assert.equal(pushes(f).length, 0);
    assert.doesNotMatch(f.summaries.join(''), /SQL AND LEDGER PASSED/);
  });
}

for (const options of [
  { badSQL: true },
  { production: 'd'.repeat(40) },
  { source: 'd'.repeat(40) },
  { cli: '2.120.0' },
  { linkProject: 'other' },
  {
    dsn: `postgresql://postgres.${PROJECT}:password@x.pooler.supabase.com/postgres`,
  },
  { local: [...versions, versions[0]] },
]) {
  test(`pre-apply refusal ${JSON.stringify(options)}`, () => {
    const f = fixture(options);
    assert.throws(f.go);
    assert.equal(pushes(f).length, 0);
  });
}

test('postcheck failure propagates after exactly one apply, never records success', () => {
  const f = fixture({ failAt: '-f /control/' });
  assert.throws(f.go);
  assert.equal(pushes(f).length, 1);
  assert.match(f.summaries.at(-1), /FAILED OR UNKNOWN/);
  assert.doesNotMatch(f.summaries.join(''), /SQL AND LEDGER PASSED/);
});
test('post-apply pending ledger blocks SQL postcheck', () => {
  const f = fixture({ after: table() });
  assert.throws(f.go);
  assert.equal(pushes(f).length, 1);
  assert(!f.calls.some((c) => c.args.includes('-f')));
});
test('first error at link/list/apply stops with no retry', () => {
  for (const failAt of [
    'supabase link',
    'supabase migration list',
    'supabase db push',
  ]) {
    const f = fixture({ failAt });
    assert.throws(f.go);
    assert.equal(f.calls.filter((c) => c.key.includes(failAt)).length, 1);
    assert(f.calls.at(-1).key.includes(failAt));
  }
});
test('preflight checks production before source checkout', () => {
  const f = fixture();
  preflight(f.config, f.run);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].cmd, 'gh');
});
test('strict markdown and ANSI table fixtures match pinned Go table fields', () => {
  const markdown =
    '|Local|Remote|Time (UTC)|\n|-|-|-|\n' +
    versions.map((v) => `|\`${v}\`|\`${v}\`|\`${time(v)}\`|`).join('\n');
  assert.equal(
    parseLedger('\x1b[32m' + markdown + '\x1b[0m', versions).pending.length,
    0
  );
});
test('DSN only accepts bound Supabase users/hosts, safe SSL and database', () => {
  assert.equal(
    connection(
      `postgresql://postgres@db.${PROJECT}.supabase.co/postgres?sslmode=verify-full`,
      PROJECT
    ).PGSSLMODE,
    'verify-full'
  );
  for (const dsn of [
    `postgres://postgres@evil.test/postgres`,
    `postgres://postgres@db.${PROJECT}.supabase.co/postgres?sslmode=disable`,
    `postgres://postgres@db.${PROJECT}.supabase.co/postgres?options=bad`,
    `postgres://postgres@db.${PROJECT}.supabase.co/other`,
    `postgres://postgres%40evil@db.${PROJECT}.supabase.co/postgres`,
  ])
    assert.throws(() => connection(dsn, PROJECT));
});
test('supplied SQL bytes and read-only transaction remain pinned', () => {
  assert.equal(sql.length, 9940);
  assert.equal(createHash('sha256').update(sql).digest('hex'), SQL_HASH);
  assert.match(sql.toString(), /BEGIN TRANSACTION READ ONLY;/);
  assert.match(sql.toString(), /ROLLBACK;/);
});
test('workflow has one protected manual job, pinned source separation and no fan-out or marker writes', () => {
  const workflow = fs.readFileSync(
    new URL(
      '../../.github/workflows/supabase-production-migration-only.yaml',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(workflow, /environment: supabase-production-migrations/);
  assert.match(workflow, /group: supabase-production-migration\n/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /queue: max/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /version: ['"]2\.121\.0['"]/);
  assert.match(workflow, /path: migration-source/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.doesNotMatch(
    workflow,
    /workflow_run:|pull_request:|deployments:|actions: write|workflow_call:|continue-on-error|record-deployment|planner|vercel/i
  );
  assert.equal(
    (workflow.match(/secrets\.SUPABASE_ACCESS_TOKEN/g) || []).length,
    1
  );
  assert.equal(
    (workflow.match(/secrets\.PRODUCTION_DB_PASSWORD/g) || []).length,
    1
  );
  assert.equal((workflow.match(/^  migrate:/gm) || []).length, 1);
});

test('production moving before apply refuses without mutation', () => {
  const f = fixture({ productionByCall: [sha, 'd'.repeat(40)] });
  assert.throws(f.go);
  assert.equal(pushes(f).length, 0);
});
test('ambient libpq host override cannot escape the linked DSN', () => {
  const f = fixture({ env: { PGHOSTADDR: '127.0.0.1', PGSERVICE: 'other' } });
  f.go();
  assert.equal(f.calls.at(-1).opts.env.PGHOSTADDR, undefined);
  assert.equal(f.calls.at(-1).opts.env.PGSERVICE, undefined);
});
