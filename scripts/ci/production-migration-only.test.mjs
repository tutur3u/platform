import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  migrate,
  execute,
  redact,
  INDEX_NAMES,
  INDEX_PROBE,
  preflight,
  parseLedger,
  connection,
  PROJECT,
  CLI,
  SQL_HASH,
  VERSIONS,
} from './production-migration-only.mjs';
import './production-migration-ledger-time.test.mjs';

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
    summaries = [],
    diagnostics = [];
  let lists = 0,
    fences = 0;
  const config = { ...env(), ...options.env };
  const io = {
    readFileSync(file) {
      if (file.endsWith('.sql'))
        return options.badSQL ? Buffer.from('altered') : sql;
      if (file.endsWith('/project-ref')) return options.linkProject ?? PROJECT;
      if (file.endsWith('/pooler-url') && options.missingPooler)
        throw new Error('Missing pooler metadata');
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
    if (options.failAt && key.includes(options.failAt)) {
      const error = new Error('Injected command failure');
      Object.assign(error, options.failure ?? {});
      throw error;
    }
    let stdout = '';
    if (cmd === 'gh')
      stdout =
        options.productionByCall?.[fences++] ?? options.production ?? sha;
    if (cmd === 'git')
      stdout = opts.cwd.endsWith('apps/database')
        ? (options.source ?? sha)
        : control;
    if (key === 'supabase --version') stdout = options.cli ?? CLI;
    if (cmd === 'psql' && args.includes('-c'))
      stdout =
        args.at(-1) === INDEX_PROBE ? (options.indexProbeOutput ?? '[]') : '1';
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
    diagnostics,
    run,
    go: () =>
      migrate({
        env: config,
        run,
        io,
        log: (line) => diagnostics.push(line),
        root: '/control',
      }),
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
    `psql -X -v ON_ERROR_STOP=1 -A -t -c ${INDEX_PROBE}`,
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

// Synthetic regression, NOT a retained real CLI capture or production ledger receipt.
test('all thirteen presence holes remain pending below and above an applied watermark', () => {
  const watermark = '20261111120300';
  const local = [...versions, watermark].sort();
  const ledger = table(VERSIONS, local);
  assert.deepEqual(parseLedger(ledger, local).pending, VERSIONS);
  assert.equal(VERSIONS.filter((v) => v < watermark).length, 11);
  const f = fixture({ local, before: ledger, after: table([], local) });
  f.go();
  assert.equal(pushes(f).length, 1);
  assert.deepEqual(pushes(f)[0].args, ['db', 'push', '--include-all']);
});

test('missing pooler metadata reports pooler phase with unavailable actual ledger', () => {
  const f = fixture({ missingPooler: true });
  assert.throws(f.go);
  assert.equal(pushes(f).length, 0);
  const output = f.diagnostics.join('\n');
  assert.match(output, /phase=pooler/);
  assert.match(output, /ACTUAL=unavailable/);
  assert.match(output, /EXPECTED=\["20261111120000"/);
  assert.doesNotMatch(output, /ACTUAL=\[\]/);
});

test('unsafe pooler URI is redacted and fails before push in pooler phase', () => {
  const password = 'p:a/ss?@word%';
  const f = fixture({
    dsn: `postgresql://postgres.${PROJECT}:${encodeURIComponent(password)}@evil.invalid/postgres`,
    env: { SUPABASE_DB_PASSWORD: password },
  });
  assert.throws(f.go);
  assert.equal(pushes(f).length, 0);
  assert.match(f.diagnostics.join('\n'), /phase=pooler/);
  assert(!f.diagnostics.join('\n').includes(password));
  assert(!f.diagnostics.join('\n').includes(encodeURIComponent(password)));
});

test('failed calls expose both streams after raw, encoded, JSON and URI secret redaction', () => {
  const password = 'pa:ss/wo?rd@%"\\';
  const token = 'sbp_token-123456789';
  const encoded = encodeURIComponent(password);
  const derived = 'derived-pg-password-123';
  const failure = {
    stdout: `stdout ${password} ${encoded} ${JSON.stringify(password)} token=${token}`,
    stderr: `stderr postgresql://postgres:${encoded}@db.example.invalid/postgres PGPASSWORD=${derived} authorization=Bearer ${token}`,
  };
  const f = fixture({
    failAt: '-f /control/',
    failure,
    env: {
      SUPABASE_DB_PASSWORD: derived,
      SUPABASE_ACCESS_TOKEN: token,
      OTHER_SECRET: password,
    },
  });
  assert.throws(f.go);
  const output = f.diagnostics.join('\n') + f.summaries.join('\n');
  assert.match(output, /stdout/);
  assert.match(output, /stderr/);
  assert.match(output, /phase=postcheck/);
  assert.match(output, /ACTUAL=\[\]/);
  for (const secret of [
    password,
    encoded,
    JSON.stringify(password).slice(1, -1),
    token,
    derived,
  ])
    assert(!output.includes(secret), secret);
  assert.equal(pushes(f).length, 1);
  assert.doesNotMatch(f.summaries.join('\n'), /SQL AND LEDGER PASSED/);
});

for (const [failAt, phase] of [
  ['supabase --version', 'version'],
  ['supabase link', 'link'],
  ['-c SELECT 1', 'ready'],
  ['supabase migration list', 'ledger-pre'],
  ['supabase db push', 'push'],
  ['-f /control/', 'postcheck'],
]) {
  test(`failing call reports ${phase} without retry`, () => {
    const f = fixture({
      failAt,
      failure: { stdout: 'visible stdout', stderr: 'visible stderr' },
    });
    assert.throws(f.go);
    const output = f.diagnostics.join('\n');
    assert.match(output, new RegExp('phase=' + phase));
    assert.match(output, /visible stdout/);
    assert.match(output, /visible stderr/);
    assert.equal(f.calls.filter((c) => c.key.includes(failAt)).length, 1);
    assert.match(output, /EXPECTED=\[/);
    if (phase !== 'push' && phase !== 'postcheck')
      assert.match(output, /ACTUAL=unavailable/);
    if (phase === 'push') assert.match(output, /apply_extent=unknown/);
  });
}

test('pending mismatch reports only computed actual and expected version strings', () => {
  const f = fixture({ before: table(VERSIONS.slice(1)) });
  assert.throws(f.go);
  const output = f.diagnostics.join('\n');
  assert.match(output, /phase=ledger-pre/);
  assert(output.includes('ACTUAL=' + JSON.stringify(VERSIONS.slice(1))));
  assert(output.includes('EXPECTED=' + JSON.stringify(VERSIONS)));
  assert.equal(pushes(f).length, 0);
});

test('hostile malformed expected input never appears in preflight diagnostics', () => {
  const f = fixture({
    env: { EXPECTED_PENDING_VERSIONS: '["<script>private text</script>"]' },
  });
  assert.throws(f.go);
  assert.equal(f.calls.length, 0);
  assert.match(f.diagnostics.join('\n'), /phase=preflight/);
  assert.match(f.diagnostics.join('\n'), /EXPECTED=unavailable/);
  assert(!f.diagnostics.join('\n').includes('<script>'));
});

for (const valid of [false, true]) {
  for (const name of INDEX_NAMES) {
    test(`catalog ${name} valid=${valid} refuses before push`, () => {
      const f = fixture({
        indexProbeOutput: JSON.stringify([{ name, valid }]),
      });
      assert.throws(f.go);
      assert.equal(pushes(f).length, 0);
      assert.match(f.diagnostics.join('\n'), /phase=preflight/);
      assert.match(
        f.diagnostics.join('\n'),
        valid ? /name already exists/ : /INVALID canonical index/
      );
      assert.match(f.diagnostics.join('\n'), /ACTUAL=\["20261111120000"/);
    });
  }
}
test('catalog no-names probe is read-only and precedes exactly one push', () => {
  const f = fixture({ indexProbeOutput: '[]' });
  f.go();
  const probe = f.calls.findIndex((c) => c.args.includes(INDEX_PROBE));
  assert(probe >= 0 && probe < f.calls.indexOf(pushes(f)[0]));
  assert.match(f.calls[probe].opts.env.PGOPTIONS, /read_only=on/);
  assert.equal(pushes(f).length, 1);
  assert.doesNotMatch(INDEX_PROBE, /IF NOT EXISTS|CREATE|DROP|ALTER/i);
});
test('canonical qualified catalog names agree with the four migration statements', () => {
  const suffixes = [
    '20261111120204_meet_ai_chunks_account_session_idx',
    '20261111120205_meet_ai_chunks_timeline_idx',
    '20261111120202_meet_ai_chunks_legacy_sequence_key',
    '20261111120203_meet_ai_chunks_stream_sequence_key',
  ];
  for (const [index, file] of suffixes.entries()) {
    const source = fs.readFileSync(
      new URL(
        `../../apps/database/supabase/migrations/${file}.sql`,
        import.meta.url
      ),
      'utf8'
    );
    const name = INDEX_NAMES[index].slice('public.'.length);
    assert.match(
      source,
      new RegExp(
        'create (?:unique )?index concurrently if not exists ' +
          name +
          '\\s+on public\\.meet_ai_chunks\\s*\\(',
        'i'
      )
    );
  }
});
for (const result of [
  { status: 1 },
  { status: null },
  { status: 0, signal: 'SIGTERM' },
  { status: null, error: { code: 'ETIMEDOUT' } },
]) {
  test(`spawn outcome ${JSON.stringify(result)} fails once with captured redacted streams`, () => {
    const f = fixture({ env: { SUPABASE_DB_PASSWORD: 'private-pg-secret' } });
    const run = (cmd, args, opts) => {
      const value = f.run(cmd, args, opts);
      if (cmd === 'supabase' && args[0] === 'db')
        return execute(cmd, args, opts, () => ({
          ...result,
          stdout: 'partial private-pg-secret',
          stderr: 'failure private-pg-secret',
        }));
      return value;
    };
    assert.throws(() =>
      migrate({
        env: f.config,
        run,
        io: f.io,
        root: '/control',
        log: (line) => f.diagnostics.push(line),
      })
    );
    assert.equal(pushes(f).length, 1);
    assert.equal(f.calls.at(-1).key, 'supabase db push --include-all');
    const output = f.diagnostics.join('\n');
    assert.match(output, /partial/);
    assert.match(output, /failure/);
    assert.match(output, /apply_extent=unknown/);
    assert(!output.includes('private-pg-secret'));
  });
}
test('redaction strips terminal bypasses and unbound URI credentials without executing output', () => {
  const secret = 'top-secret-credential';
  const value = `${secret.slice(0, 4)}\x1b[31m${secret.slice(4)} postgresql://user:unboundpassword@host/db?token=unboundtoken\n::error::payload`;
  const safe = redact(value, [{ SUPABASE_ACCESS_TOKEN: secret }]);
  assert(!safe.includes(secret));
  assert(!safe.includes('unboundpassword'));
  assert(!safe.includes('unboundtoken'));
  assert(!safe.includes('\n::error::'));
});

test('returned failures cannot leak captured secrets through error properties', () => {
  const secret = 'error-object-secret-123';
  const f = fixture({
    failAt: 'supabase link',
    failure: { stdout: secret, stderr: encodeURIComponent(secret) },
    env: { SUPABASE_DB_PASSWORD: secret },
  });
  let caught;
  try {
    f.go();
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof Error);
  assert.equal(caught.message, 'Injected command failure');
  assert.match(caught.stdout, /REDACTED/);
  assert.match(caught.stderr, /REDACTED/);
  assert(!JSON.stringify(caught).includes(secret));
  assert(!String(caught).includes(secret));
});
test('percent-escape casing does not evade known secret redaction', () => {
  const secret = 'pa/ss?word';
  const safe = redact('pa%2fss%3Fword', [{ PGPASSWORD: secret }]);
  assert(!safe.includes('pa%2Fss%3Fword'));
  assert.match(safe, /REDACTED/);
});

test('ledger parser guard exposes captured streams after redaction on zero command exit', () => {
  const secret = 'parser-output-secret-123';
  const f = fixture({
    before: 'unexpected ' + secret,
    env: { SUPABASE_ACCESS_TOKEN: secret },
  });
  assert.throws(f.go);
  assert.equal(pushes(f).length, 0);
  const output = f.diagnostics.join('\n');
  assert.match(output, /phase=ledger-pre/);
  assert.match(output, /unexpected \[REDACTED\]/);
  assert.match(output, /stderr/);
  assert.match(output, /ACTUAL=unavailable/);
  assert(!output.includes(secret));
});

const realPrefix = './fixtures/production-migration-cli-2.121.0-';
const realAll = fs.readFileSync(
  new URL(realPrefix + 'all-applied.stdout', import.meta.url)
);
const realHoles = fs.readFileSync(
  new URL(realPrefix + 'thirteen-holes.stdout', import.meta.url)
);
const capturedVersions = [
  ...realAll.toString().matchAll(/^\s*`(\d{14})`\s*\|/gm),
].map((match) => match[1]);

test('real pinned local all-applied output parses with zero pending versions', () => {
  assert.equal(
    createHash('sha256').update(realAll).digest('hex'),
    '5022268a3559cfd56af73567b8147925e28de0440cf65356ce52876fb45acef8'
  );
  assert.equal(capturedVersions.length, 1575);
  assert.equal(new Set(capturedVersions).size, 1575);
  const parsed = parseLedger(realAll.toString(), capturedVersions);
  assert.deepEqual(parsed.pending, []);
  assert.equal(parsed.remote.length, 1575);
});
test('real pinned local hole output retains eleven older holes and two newer ones', () => {
  assert.equal(
    createHash('sha256').update(realHoles).digest('hex'),
    'a592cff8c9d344426247b97618326ce675ca22c8a640fb3a9daa6470972363b4'
  );
  const parsed = parseLedger(realHoles.toString(), capturedVersions);
  assert.deepEqual(parsed.pending, VERSIONS);
  assert(parsed.remote.includes('20261111120300'));
  assert.equal(parsed.pending.filter((v) => v < '20261111120300').length, 11);
  const provenance = JSON.parse(
    fs.readFileSync(
      new URL(realPrefix + 'provenance.json', import.meta.url),
      'utf8'
    )
  );
  assert.equal(provenance.cliVersion, CLI);
  assert.equal(provenance.holeOperation.rowsProvenAppliedBefore, 13);
  assert.equal(provenance.holeOperation.rowsDeleted, 13);
  assert.deepEqual(provenance.holeOperation.versions, VERSIONS);
  assert.equal(provenance.cleanup.ownedContainersRemaining, 0);
});
const firstCapturedRow = realHoles
  .toString()
  .split('\n')
  .find((line) => line.includes('`20230202082703`'));
for (const [label, before] of Object.entries({
  changed: realHoles
    .toString()
    .replace(
      firstCapturedRow,
      firstCapturedRow
        .replace(/`20230202082703`/g, '`20230202082704`')
        .replace('2023-02-02 08:27:03', '2023-02-02 08:27:04')
    ),
  extraPending: realHoles
    .toString()
    .replace(
      firstCapturedRow,
      firstCapturedRow.replace('| `20230202082703`', '| ` `')
    ),
  truncated: realHoles.toString().replace(firstCapturedRow + '\n', ''),
  orphan:
    realHoles.toString().trimEnd() +
    '\n | `20261114123456` | `2026-11-14 12:34:56`\n',
  malformed: realHoles.toString().replace('Local', 'Unknown'),
})) {
  test(`altered real fixture ${label} refuses before any push`, () => {
    const f = fixture({ local: capturedVersions, before });
    assert.throws(f.go);
    assert.equal(pushes(f).length, 0);
  });
}

test('catalog probe command failure stops before push with phase and observed versions', () => {
  const f = fixture({
    failAt: 'pg_catalog.pg_class',
    failure: { stdout: 'catalog stdout', stderr: 'catalog stderr' },
  });
  assert.throws(f.go);
  assert.equal(pushes(f).length, 0);
  assert.match(f.diagnostics.join('\n'), /phase=preflight/);
  assert.match(f.diagnostics.join('\n'), /ACTUAL=\["20261111120000"/);
  assert.match(f.diagnostics.join('\n'), /catalog stderr/);
});
