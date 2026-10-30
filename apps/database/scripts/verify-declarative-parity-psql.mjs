// psql connection helpers for the declarative schema parity runner
// (verify-declarative-parity.mjs). The URL is read from an environment variable
// and never put in argv, any non-loopback target must use --hashes-only over
// verify-full TLS with a pinned CA, SCRAM and channel binding, and psql runs
// with a minimal environment on the host and inside a Docker container alike.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const SESSION_OPTIONS = [
  'default_transaction_read_only=on',
  'statement_timeout=60s',
  'lock_timeout=1s',
  'idle_in_transaction_session_timeout=120s',
  'search_path=pg_catalog',
];
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const NO_FILE = '/nonexistent/tuturuuu-declarative-parity';
const APP_NAME = 'tuturuuu-declarative-parity';
// libpq variables a container's own environment could use to redirect or
// reconfigure the run; the Docker path unsets every one before psql starts.
export const DOCKER_UNSET_PG_ENV = [
  'PGHOST',
  'PGHOSTADDR',
  'PGPORT',
  'PGDATABASE',
  'PGUSER',
  'PGPASSWORD',
  'PGPASSFILE',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGSYSCONFDIR',
  'PGSSLMODE',
  'PGREQUIRESSL',
  'PGSSLROOTCERT',
  'PGSSLCERT',
  'PGSSLKEY',
  'PGSSLCRL',
  'PGGSSENCMODE',
  'PGTARGETSESSIONATTRS',
  'PGLOADBALANCEHOSTS',
  'PGCLIENTENCODING',
  'PGDATESTYLE',
  'PGTZ',
  'PGOPTIONS',
  'PGAPPNAME',
  'PSQLRC',
];
const PSQL_ARGS = ['-X', '-q', '-A', '-t', '-F', '\t', '-v', 'ON_ERROR_STOP=1'];

// Classifies the target. Docker and loopback URLs are local. Anything else is
// remote and must run --hashes-only over verify-full TLS with a pinned CA; URL
// query parameters are refused so nothing can override sslmode or the host.
export function psqlInvocation({
  dockerContainer,
  dockerUser,
  databaseUrl,
  caFile,
  hashesOnly: hashesOnlyRun = false,
  fsImpl = fs,
  uid = process.getuid?.(),
}) {
  const pgoptions = SESSION_OPTIONS.map((option) => `-c ${option}`).join(' ');
  if (dockerContainer) {
    // `env -u` clears the container's PG* variables (an empty PGSERVICE or
    // PGSSLMODE would be an error, not a reset), so psql uses its default
    // socket with only the options set here.
    return {
      command: 'docker',
      args: [
        'exec',
        '-i',
        dockerContainer,
        'env',
        ...DOCKER_UNSET_PG_ENV.flatMap((name) => ['-u', name]),
        'LC_ALL=C',
        `PGOPTIONS=${pgoptions}`,
        `PGAPPNAME=${APP_NAME}`,
        `PGPASSFILE=${NO_FILE}`,
        `PGSERVICEFILE=${NO_FILE}`,
        `PGSYSCONFDIR=${NO_FILE}`,
        'psql',
        ...PSQL_ARGS,
        '-U',
        dockerUser || 'postgres',
        '-d',
        'postgres',
        '-f',
        '-',
      ],
      env: process.env,
      local: true,
      secrets: [],
    };
  }
  if (!databaseUrl) throw new Error('missing-database-url');
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('unsupported-database-url');
  }
  if (url.search || url.hash)
    throw new Error('database-url-parameters-refused');
  if (!url.hostname || /[,/]/.test(url.hostname)) {
    throw new Error('database-url-host-refused');
  }
  const local = LOOPBACK_HOSTS.has(url.hostname);
  let tls = { PGSSLMODE: 'disable' };
  if (!local) {
    if (!hashesOnlyRun) throw new Error('remote-target-requires-hashes-only');
    if (!caFile) throw new Error('remote-target-requires-pinned-ca-file');
    const ca = assertCaFile(path.resolve(caFile), { fsImpl, uid });
    // Channel binding needs TLS, so it and SCRAM are pinned for remote only.
    tls = {
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: ca,
      PGCHANNELBINDING: 'require',
      PGREQUIREAUTH: 'scram-sha-256',
    };
  }
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  // Minimal environment: no inherited PG* variables, service files, password
  // files, hostaddr overrides or client certificates.
  const env = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    LC_ALL: 'C',
    PGHOST: url.hostname.replace(/^\[(.*)\]$/, '$1'),
    PGPORT: url.port || '5432',
    PGUSER: user,
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)) || 'postgres',
    ...tls,
    PGGSSENCMODE: 'disable',
    PGSSLCERT: NO_FILE,
    PGSSLKEY: NO_FILE,
    PGPASSFILE: NO_FILE,
    PGSERVICEFILE: NO_FILE,
    PGSYSCONFDIR: NO_FILE,
    PGCONNECT_TIMEOUT: '15',
    PGOPTIONS: pgoptions,
    PGAPPNAME: APP_NAME,
  };
  if (password) env.PGPASSWORD = password;
  return {
    command: 'psql',
    args: [...PSQL_ARGS, '-f', '-'],
    env,
    local,
    secrets: [password, user, url.hostname].filter(Boolean),
  };
}

// The pinned CA must be a regular file (not a symlink) owned by the runner,
// readable by it and writable by no group or other user. Its parent directory
// must be a real directory owned by the runner or root and not group- or
// world-writable, so nobody else can swap the file between check and use.
export function assertCaFile(
  ca,
  { fsImpl = fs, uid = process.getuid?.() } = {}
) {
  const stat = fsImpl.lstatSync(ca, { throwIfNoEntry: false });
  if (!stat?.isFile()) throw new Error('ca-file-not-regular');
  if (stat.mode & 0o022) throw new Error('ca-file-group-or-world-writable');
  if (uid === undefined || stat.uid !== uid) {
    throw new Error('ca-file-not-owned-by-runner');
  }
  const parent = fsImpl.lstatSync(path.dirname(ca), { throwIfNoEntry: false });
  if (!parent?.isDirectory()) throw new Error('ca-dir-not-directory');
  if (parent.mode & 0o022) throw new Error('ca-dir-group-or-world-writable');
  if (parent.uid !== uid && parent.uid !== 0) {
    throw new Error('ca-dir-not-owned-by-runner');
  }
  try {
    fsImpl.accessSync(ca, fs.constants.R_OK);
  } catch {
    throw new Error('ca-file-unreadable');
  }
  return ca;
}

export function createPsqlExecutor(invocation, spawn = spawnSync) {
  return {
    async run(sql) {
      const result = spawn(invocation.command, invocation.args, {
        input: sql,
        env: invocation.env,
        encoding: 'utf8',
        maxBuffer: 512 * 1024 * 1024,
        timeout: 10 * 60 * 1000,
      });
      if (result.error || result.status !== 0) {
        let detail = String(result.stderr ?? result.error?.message ?? '');
        for (const secret of invocation.secrets) {
          detail = detail.split(secret).join('<redacted>');
        }
        throw new Error(
          `psql failed (${result.status ?? 'spawn'}): ${detail.trim()}`
        );
      }
      return String(result.stdout).split('\n');
    },
  };
}
