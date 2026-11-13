import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PROJECT = 'nzamlzqfdwaaxdefwraj';
export const CLI = '2.121.0';
export const SQL_HASH =
  '3c94b6e95c69523d45adf155728acc4eab03f1aeba22fda229d34fc122a212c6';
export const VERSIONS = Object.freeze([
  '20261111120000',
  '20261111120100',
  '20261111120200',
  '20261111120201',
  '20261111120202',
  '20261111120203',
  '20261111120204',
  '20261111120205',
  '20261111120206',
  '20261111120207',
  '20261111120208',
  '20261111120310',
  '20261112133000',
]);
export const MANUAL =
  'MANUAL TTR owner poststeps: realtime/rate-limit/IEEAI runtime smokes; retention Cron Control dry_run. Verify backup hash against recovery/PITR receipt <=30 minutes old BEFORE dispatch.';
const fail = (message) => {
  throw new Error(message);
};
const same = (a, b) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function validateInputs(env) {
  if (
    env.GITHUB_REPOSITORY !== 'tutur3u/platform' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
  )
    fail('Untrusted dispatch');
  if (
    !/^[0-9a-f]{40}$/.test(env.EXPECTED_SHA ?? '') ||
    !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? '')
  )
    fail('Invalid immutable SHA');
  if (
    env.EXPECTED_PROJECT_REF !== PROJECT ||
    env.PRODUCTION_PROJECT_ID !== PROJECT
  )
    fail('Production project binding mismatch');
  if (!/^[0-9a-f]{64}$/.test(env.BACKUP_RECEIPT_SHA256 ?? ''))
    fail('Invalid backup receipt SHA256');
  let versions;
  try {
    versions = JSON.parse(env.EXPECTED_PENDING_VERSIONS);
  } catch {
    fail('Pending versions must be a JSON string array');
  }
  if (
    !Array.isArray(versions) ||
    versions.length !== 13 ||
    versions.some((v) => typeof v !== 'string' || !/^\d{14}$/.test(v)) ||
    new Set(versions).size !== 13 ||
    !same(versions, VERSIONS)
  )
    fail('Expected pending versions must equal the approved thirteen');
  return versions;
}

// v2.121.0 apps/cli-go/internal/migration/list/list.go builds this three-column table.
export function parseLedger(text, localVersions) {
  const lines = text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .trim()
    .split(/\r?\n/)
    .map((s) => s.trim());
  const cells = (line) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((s) =>
        s
          .trim()
          .replace(/^`(.*)`$/, '$1')
          .trim()
      );
  if (
    !same(cells(lines[0] ?? ''), ['Local', 'Remote', 'Time (UTC)']) ||
    cells(lines[0]).join('|') !== 'Local|Remote|Time (UTC)'
  )
    fail('Unknown ledger header');
  if (!/^\|?\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|?$/.test(lines[1] ?? ''))
    fail('Missing ledger separator');
  const local = [],
    remote = [],
    pending = [];
  for (const line of lines.slice(2)) {
    const row = cells(line);
    if (row.length !== 3) fail('Malformed ledger row');
    const [l, r, time] = row;
    if (!/^\d{14}$/.test(l) || (r !== '' && r !== l))
      fail('Orphan or malformed ledger version');
    const expectedTime = `${l.slice(0, 4)}-${l.slice(4, 6)}-${l.slice(6, 8)} ${l.slice(8, 10)}:${l.slice(10, 12)}:${l.slice(12, 14)}`;
    if (time !== expectedTime || local.includes(l) || (r && remote.includes(r)))
      fail('Duplicate or malformed ledger row');
    if (local.length && l <= local.at(-1)) fail('Unordered ledger');
    local.push(l);
    if (r) remote.push(r);
    else pending.push(l);
  }
  if (!same(local, localVersions)) fail('Truncated or changed local ledger');
  return { pending, remote };
}

export function connection(dsn, project) {
  let url;
  try {
    url = new URL(dsn.trim());
  } catch {
    fail('Invalid linked database URL');
  }
  const pooled =
    url.hostname.endsWith('.pooler.supabase.com') &&
    /^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(url.hostname) &&
    url.username === `postgres.${project}`;
  const direct =
    url.hostname === `db.${project}.supabase.co` && url.username === 'postgres';
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    (!pooled && !direct) ||
    url.password ||
    url.hash ||
    url.pathname !== '/postgres' ||
    (url.port && !['5432', '6543'].includes(url.port))
  )
    fail('Unapproved linked database connection');
  const params = [...url.searchParams];
  if (
    params.some(
      ([k, v]) => k !== 'sslmode' || !['require', 'verify-full'].includes(v)
    ) ||
    params.length > 1
  )
    fail('Unapproved connection parameters');
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: url.username,
    PGDATABASE: 'postgres',
    PGSSLMODE: url.searchParams.get('sslmode') || 'require',
  };
}

export function execute(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 20 * 60 * 1000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.signal || result.status !== 0)
    fail(`Command failed: ${command}`);
  return { stdout: result.stdout, stderr: result.stderr };
}

export function productionFence(env, run) {
  const result = run(
    'gh',
    [
      'api',
      'repos/tutur3u/platform/git/ref/heads/production',
      '--jq',
      '.object | if .type == "commit" then .sha else "" end',
    ],
    { env }
  );
  if (result.stdout.trim() !== env.EXPECTED_SHA)
    fail('Production ref moved or mismatched');
}

export function preflight(env, run = execute) {
  validateInputs(env);
  productionFence(env, run);
}

export function migrate({
  env = process.env,
  run = execute,
  io = fs,
  root = process.cwd(),
} = {}) {
  const expected = validateInputs(env);
  const target = path.resolve(root, 'migration-source/apps/database');
  const sql = path.resolve(
    root,
    'scripts/ci/production-migration-option-a-postcheck.sql'
  );
  const verifySQL = () => {
    if (hash(io.readFileSync(sql)) !== SQL_HASH)
      fail('Postcheck SQL hash mismatch');
  };
  const call = (cmd, args, extra = {}) =>
    run(cmd, args, { cwd: target, env, ...extra });
  const summary = (status) => {
    if (env.GITHUB_STEP_SUMMARY)
      io.appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        `\nMigration-only ${status}\n\nControl: ${env.GITHUB_SHA}\nSource: ${env.EXPECTED_SHA}\nRun: https://github.com/tutur3u/platform/actions/runs/${env.GITHUB_RUN_ID}\nCLI: ${CLI}\nBackup receipt SHA256: ${env.BACKUP_RECEIPT_SHA256}\nSQL SHA256: ${SQL_HASH}\nExpected versions: ${expected.join(', ')}\n\n${MANUAL}\n`
      );
  };
  summary('STARTED; no success recorded');
  try {
    verifySQL();
    productionFence(env, run);
    if (
      run('git', ['rev-parse', 'HEAD'], { cwd: root, env }).stdout.trim() !==
        env.GITHUB_SHA ||
      call('git', ['rev-parse', 'HEAD']).stdout.trim() !== env.EXPECTED_SHA
    )
      fail('Checkout SHA mismatch');
    if (call('supabase', ['--version']).stdout.trim() !== CLI)
      fail('Supabase CLI version mismatch');
    call('psql', ['--version']);
    const migrations = path.join(target, 'supabase/migrations');
    const versions = io
      .readdirSync(migrations, { withFileTypes: true })
      .map((entry) => {
        if (
          !entry.isFile() ||
          !/^\d{14}_[A-Za-z0-9_.-]+\.sql$/.test(entry.name)
        )
          fail('Unrecognized local migration entry');
        return entry.name.slice(0, 14);
      })
      .sort();
    if (
      !versions.length ||
      new Set(versions).size !== versions.length ||
      expected.some((v) => !versions.includes(v))
    )
      fail('Local migration versions mismatch');
    if (!env.SUPABASE_ACCESS_TOKEN || !env.SUPABASE_DB_PASSWORD)
      fail('Protected credentials unavailable');
    call('supabase', ['link', '--project-ref', PROJECT]);
    const temp = path.join(target, 'supabase/.temp');
    if (
      io.readFileSync(path.join(temp, 'project-ref'), 'utf8').trim() !== PROJECT
    )
      fail('Linked project mismatch');
    const pgBase = Object.fromEntries(
      Object.entries(env).filter(([key]) => !key.startsWith('PG'))
    );
    const pg = {
      ...pgBase,
      ...connection(
        io.readFileSync(path.join(temp, 'pooler-url'), 'utf8'),
        PROJECT
      ),
      PGPASSWORD: env.SUPABASE_DB_PASSWORD,
      PGCONNECT_TIMEOUT: '15',
      PGOPTIONS: '-c default_transaction_read_only=on',
    };
    if (
      call(
        'psql',
        ['-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-c', 'SELECT 1'],
        { env: pg }
      ).stdout.trim() !== '1'
    )
      fail('Database readiness failed');
    const ledger = () =>
      parseLedger(
        call('supabase', ['migration', 'list', '--linked']).stdout,
        versions
      );
    if (!same(ledger().pending, expected))
      fail('Actual pending versions mismatch');
    productionFence(env, run);
    verifySQL();
    call('supabase', ['db', 'push', '--include-all']);
    const applied = ledger();
    if (
      applied.pending.length ||
      expected.some((v) => !applied.remote.includes(v))
    )
      fail('Post-apply ledger mismatch');
    productionFence(env, run);
    verifySQL();
    call('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', sql], { env: pg });
    summary('SQL AND LEDGER PASSED; manual poststeps remain');
  } catch (error) {
    summary('FAILED OR UNKNOWN; stop, reconcile before any new dispatch');
    throw error;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv[2] === 'preflight') preflight(process.env);
    else if (process.argv.length === 2) migrate();
    else fail('Unsupported mode');
  } catch {
    console.error(
      'Migration-only guard or command failed; stop and reconcile. No automatic retry.'
    );
    process.exitCode = 1;
  }
}
