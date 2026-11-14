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

// v2.121.0 FormatTimestampVersion renders time.Parse("20060102150405", version)
// as "YYYY-MM-DD HH:MM:SS" and prints the version verbatim when Go rejects it,
// so each 14-digit version has exactly one expected Time cell.
export function ledgerTime(version) {
  if (!/^\d{14}$/.test(version)) fail('Malformed ledger version');
  const fields = [0, 4, 6, 8, 10, 12].map((from) =>
    version.slice(from, from === 0 ? 4 : from + 2)
  );
  const [year, month, day, hour, minute, second] = fields.map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const valid =
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= days[month - 1] &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59;
  if (!valid) return version;
  const [y, mo, d, h, mi, s] = fields;
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
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
    if (
      time !== ledgerTime(l) ||
      local.includes(l) ||
      (r && remote.includes(r))
    )
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

export const INDEX_NAMES = Object.freeze([
  'public.meet_ai_chunks_account_session_idx',
  'public.meet_ai_chunks_timeline_idx',
  'public.meet_ai_chunks_legacy_sequence_key',
  'public.meet_ai_chunks_stream_sequence_key',
]);
export const INDEX_PROBE = `SELECT COALESCE(json_agg(json_build_object('name', n.nspname || '.' || c.relname, 'valid', i.indisvalid) ORDER BY c.relname), '[]'::json)::text FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_catalog.pg_index i ON i.indexrelid = c.oid WHERE n.nspname = 'public' AND c.relname IN (${INDEX_NAMES.map((name) => "'" + name.slice('public.'.length) + "'").join(', ')});`;

export function requireNoIndexes(text) {
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    fail('Unrecognized index catalog probe output');
  }
  if (!Array.isArray(rows)) fail('Unrecognized index catalog probe output');
  if (rows.length) {
    const invalid = rows.some((row) => row?.valid === false);
    fail(
      invalid
        ? 'INVALID canonical index remains; stop for Security review'
        : 'Canonical index name already exists; stop for Security review'
    );
  }
}

export function redact(text, environments = []) {
  const secrets = new Set();
  for (const env of environments) {
    for (const [key, value] of Object.entries(env ?? {})) {
      if (typeof value !== 'string' || !value) continue;
      if (
        /password|token|secret|credential|authorization|(?:^|_)key(?:$|_)/i.test(
          key
        )
      )
        secrets.add(value);
      try {
        const uri = new URL(value);
        if (uri.password) {
          secrets.add(uri.password);
          secrets.add(decodeURIComponent(uri.password));
        }
      } catch {
        /* Non-URI environment values carry no URI credentials. */
      }
    }
  }
  let safe = String(text ?? '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
  safe = safe.replace(/%[0-9a-f]{2}/gi, (value) => value.toUpperCase());
  const variants = [...secrets]
    .flatMap((value) => {
      const encoded = encodeURIComponent(value.toWellFormed());
      return [
        value,
        value.replace(/%[0-9a-f]{2}/gi, (v) => v.toUpperCase()),
        JSON.stringify(value).slice(1, -1),
        encoded,
        encoded.replace(/%[0-9A-F]{2}/g, (v) => v.toLowerCase()),
        encodeURIComponent(encoded),
        Buffer.from(value).toString('base64'),
      ];
    })
    .map((value) => value.replace(/%[0-9a-f]{2}/gi, (v) => v.toUpperCase()))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const value of variants) safe = safe.split(value).join('[REDACTED]');
  return safe
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/?#]*@/gi, '$1[REDACTED]@')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, '$1 [REDACTED]')
    .replace(
      /((?:password|token|secret|credential|api[_-]?key|PGPASSWORD)\s*[=:]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s&,;]+)/gi,
      '$1[REDACTED]'
    )
    .split('\n')
    .map((line) => line.replace(/^(\s*)::/, '$1[escaped]::'))
    .join('\n');
}

const versionInput = (value) => {
  try {
    const versions = JSON.parse(value);
    return Array.isArray(versions) &&
      versions.every((v) => typeof v === 'string' && /^\d{14}$/.test(v))
      ? [...versions].sort()
      : null;
  } catch {
    return null;
  }
};

function diagnostics(env, log) {
  const environments = [env];
  const state = { phase: 'preflight', actual: null, mutationStarted: false };
  let lastOutput = null;
  const clean = (value) => redact(value, environments);
  const setText = (versions) => {
    if (versions === null) return 'unavailable';
    const json = JSON.stringify(versions);
    return clean(json) === json ? json : 'unavailable';
  };
  const describe = () => {
    const line = `phase=${state.phase} ACTUAL=${setText(state.actual)} EXPECTED=${setText(versionInput(env.EXPECTED_PENDING_VERSIONS))}`;
    return clean(
      line +
        (state.mutationStarted
          ? ' apply_extent=unknown; sets are last validated observations, not proof of current pending state'
          : '')
    );
  };
  const streams = () => {
    for (const stream of ['stdout', 'stderr']) {
      const value = lastOutput?.[stream];
      log(
        `phase=${state.phase} last_call_phase=${lastOutput?.phase ?? 'unavailable'} ${stream}:\n${clean(value == null ? '<unavailable>' : value || '<empty>')}`
      );
    }
  };
  const report = (error) => {
    if (!lastOutput?.printed) streams();
    log(describe());
    log(
      clean(
        `phase=${state.phase} guard=${error instanceof Error ? error.message : 'Unknown failure'}`
      )
    );
  };
  const safeError = (error) => {
    const safe = new Error(
      clean(error instanceof Error ? error.message : 'Unknown failure')
    );
    for (const stream of ['stdout', 'stderr'])
      if (error?.[stream] != null) safe[stream] = clean(error[stream]);
    safe.reported = true;
    return safe;
  };
  const wrap =
    (run) =>
    (command, args, options = {}) => {
      environments.push(options.env ?? {});
      try {
        const result = run(command, args, options);
        lastOutput = { ...result, phase: state.phase, printed: false };
        return result;
      } catch (error) {
        lastOutput = {
          stdout: error?.stdout,
          stderr: error?.stderr,
          phase: state.phase,
          printed: true,
        };
        streams();
        throw safeError(error);
      }
    };
  return { state, clean, report, wrap, describe, safeError };
}

export function execute(command, args, options, spawn = spawnSync) {
  const result = spawn(command, args, {
    ...options,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 20 * 60 * 1000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.signal || result.status !== 0) {
    const status = Number.isInteger(result.status) ? result.status : 'unknown';
    const signal =
      typeof result.signal === 'string' && /^[A-Z0-9]+$/.test(result.signal)
        ? result.signal
        : 'none';
    const code =
      typeof result.error?.code === 'string' &&
      /^[A-Z0-9_]+$/.test(result.error.code)
        ? result.error.code
        : 'none';
    const name = ['supabase', 'psql', 'git', 'gh'].includes(command)
      ? command
      : 'external';
    const error = new Error(
      `Command ${name} failed or outcome unknown (status=${status}, signal=${signal}, code=${code})`
    );
    error.stdout = redact(result.stdout, [options?.env ?? process.env]);
    error.stderr = redact(result.stderr, [options?.env ?? process.env]);
    throw error;
  }
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

export function preflight(env, run = execute, log = console.error) {
  const diagnostic = diagnostics(env, log);
  try {
    validateInputs(env);
    productionFence(env, diagnostic.wrap(run));
  } catch (error) {
    diagnostic.report(error);
    throw diagnostic.safeError(error);
  }
}

export function migrate({
  env = process.env,
  run = execute,
  io = fs,
  root = process.cwd(),
  log = console.error,
} = {}) {
  const diagnostic = diagnostics(env, log);
  const command = diagnostic.wrap(run);
  let expected;
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
    command(cmd, args, { cwd: target, env, ...extra });
  const summary = (status) => {
    if (expected && env.GITHUB_STEP_SUMMARY)
      io.appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        diagnostic.clean(
          `\nMigration-only ${status}\n${diagnostic.describe()}\n\nControl: ${env.GITHUB_SHA}\nSource: ${env.EXPECTED_SHA}\nRun: https://github.com/tutur3u/platform/actions/runs/${env.GITHUB_RUN_ID}\nCLI: ${CLI}\nBackup receipt SHA256: ${env.BACKUP_RECEIPT_SHA256}\nSQL SHA256: ${SQL_HASH}\nExpected versions: ${expected.join(', ')}\n\n${MANUAL}\n`
        )
      );
  };
  try {
    expected = validateInputs(env);
    summary('STARTED; no success recorded');
    verifySQL();
    productionFence(env, command);
    if (
      command('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        env,
      }).stdout.trim() !== env.GITHUB_SHA ||
      call('git', ['rev-parse', 'HEAD']).stdout.trim() !== env.EXPECTED_SHA
    )
      fail('Checkout SHA mismatch');
    diagnostic.state.phase = 'version';
    if (call('supabase', ['--version']).stdout.trim() !== CLI)
      fail('Supabase CLI version mismatch');
    call('psql', ['--version']);
    diagnostic.state.phase = 'preflight';
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
    diagnostic.state.phase = 'link';
    if (!env.SUPABASE_ACCESS_TOKEN || !env.SUPABASE_DB_PASSWORD)
      fail('Protected credentials unavailable');
    call('supabase', ['link', '--project-ref', PROJECT]);
    diagnostic.state.phase = 'pooler';
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
    diagnostic.state.phase = 'ready';
    if (
      call(
        'psql',
        ['-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-c', 'SELECT 1'],
        { env: pg }
      ).stdout.trim() !== '1'
    )
      fail('Database readiness failed');
    const ledger = () => {
      diagnostic.state.actual = null;
      const parsed = parseLedger(
        call('supabase', ['migration', 'list', '--linked']).stdout,
        versions
      );
      diagnostic.state.actual = parsed.pending;
      return parsed;
    };
    diagnostic.state.phase = 'ledger-pre';
    if (!same(ledger().pending, expected))
      fail('Actual pending versions mismatch');
    diagnostic.state.phase = 'preflight';
    productionFence(env, command);
    verifySQL();
    requireNoIndexes(
      call(
        'psql',
        ['-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-c', INDEX_PROBE],
        { env: pg }
      ).stdout
    );
    diagnostic.state.phase = 'push';
    diagnostic.state.mutationStarted = true;
    call('supabase', ['db', 'push', '--include-all']);
    diagnostic.state.phase = 'ledger-post';
    const applied = ledger();
    if (
      applied.pending.length ||
      expected.some((v) => !applied.remote.includes(v))
    )
      fail('Post-apply ledger mismatch');
    diagnostic.state.phase = 'postcheck';
    productionFence(env, command);
    verifySQL();
    call('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', sql], { env: pg });
    summary('SQL AND LEDGER PASSED; manual poststeps remain');
  } catch (error) {
    diagnostic.report(error);
    try {
      summary('FAILED OR UNKNOWN; stop, reconcile before any new dispatch');
    } catch (summaryError) {
      throw diagnostic.safeError(summaryError);
    }
    throw diagnostic.safeError(error);
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
  } catch (error) {
    if (!error?.reported) diagnostics(process.env, console.error).report(error);
    console.error(
      'Migration-only guard or command failed; stop and reconcile. No automatic retry.'
    );
    process.exitCode = 1;
  }
}
