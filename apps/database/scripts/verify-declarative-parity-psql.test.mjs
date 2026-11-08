import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertCaFile,
  createPsqlExecutor,
  main,
  psqlInvocation,
} from './verify-declarative-parity.mjs';

// Connection, pinned-CA and --prod-parity guard tests for the declarative
// parity runner; catalog fixture tests live in verify-declarative-parity.test.mjs.
const REMOTE =
  'postgresql://parity_role:s3cr3t-pass@db.internal.example:6543/postgres';
const uid = process.getuid();
const caStat = (overrides = {}) => ({
  isFile: () => true,
  isDirectory: () => false,
  mode: 0o100644,
  uid,
  ...overrides,
});
const dirStat = (overrides = {}) => ({
  isFile: () => false,
  isDirectory: () => true,
  mode: 0o40755,
  uid,
  ...overrides,
});
const caFsWith = (file = caStat(), dir = dirStat()) => ({
  lstatSync: (target) => (target.endsWith('.pem') ? file : dir),
  accessSync: () => {},
});
const caFs = caFsWith();
const ENV_KEYS = [
  'LC_ALL',
  'PATH',
  'PGAPPNAME',
  'PGCHANNELBINDING',
  'PGCONNECT_TIMEOUT',
  'PGDATABASE',
  'PGGSSENCMODE',
  'PGHOST',
  'PGOPTIONS',
  'PGPASSFILE',
  'PGPASSWORD',
  'PGPORT',
  'PGREQUIREAUTH',
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
        fsImpl: { lstatSync: () => undefined, accessSync: () => {} },
      }),
    /ca-file-not-regular/
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
  assert.equal(invocation.env.PGCHANNELBINDING, 'require');
  assert.equal(invocation.env.PGREQUIREAUTH, 'scram-sha-256');
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
  // The container's own PG* variables are unset before psql starts.
  const envAt = docker.args.indexOf('env');
  const psqlAt = docker.args.indexOf('psql');
  assert.ok(envAt > docker.args.indexOf('supabase_db_lane') && envAt < psqlAt);
  const unset = docker.args
    .slice(envAt, psqlAt)
    .flatMap((arg, i, all) => (arg === '-u' ? [all[i + 1]] : []));
  for (const name of [
    'PGHOST',
    'PGHOSTADDR',
    'PGPORT',
    'PGSERVICE',
    'PGSSLMODE',
  ]) {
    assert.ok(unset.includes(name), `unsets ${name}`);
  }
  assert.ok(
    docker.args
      .slice(envAt, psqlAt)
      .includes('PGPASSFILE=/nonexistent/tuturuuu-declarative-parity')
  );
  assert.ok(!docker.args.slice(0, envAt).includes('-e'));
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

test('--prod-parity refuses a local target, a full run or no --expect before connecting', async () => {
  const env = {
    DECLARATIVE_PARITY_DATABASE_URL:
      'postgres://postgres:postgres@127.0.0.1:54322/postgres',
  };
  await assert.rejects(
    main(['--prod-parity', '--hashes-only'], env),
    /prod-parity-requires-expect/
  );
  await assert.rejects(
    main(['--prod-parity', '--hashes-only'], {
      DECLARATIVE_PARITY_DATABASE_URL: REMOTE,
    }),
    /prod-parity-requires-expect/
  );
  await assert.rejects(
    main(
      ['--prod-parity', '--hashes-only', '--expect', '/nonexistent.json'],
      env
    ),
    /prod-parity-requires-remote-hashes-only/
  );
  await assert.rejects(
    main(['--prod-parity', '--expect', '/nonexistent.json'], {
      DECLARATIVE_PARITY_DATABASE_URL: REMOTE,
    }),
    /remote-target-requires-hashes-only/
  );
});

test('the pinned CA must be a regular, runner-owned, readable file in a safe dir', () => {
  const check = (stat, accessSync = () => {}, dir = dirStat()) =>
    assertCaFile('/ca.pem', {
      fsImpl: { ...caFsWith(stat, dir), accessSync },
      uid,
    });
  assert.throws(
    () => check(caStat(), undefined, caStat()),
    /ca-dir-not-directory/
  );
  assert.throws(
    () => check(caStat(), undefined, dirStat({ mode: 0o41777 })),
    /ca-dir-group-or-world-writable/
  );
  assert.throws(
    () => check(caStat(), undefined, dirStat({ mode: 0o40775 })),
    /ca-dir-group-or-world-writable/
  );
  assert.throws(
    () => check(caStat(), undefined, dirStat({ uid: uid + 1 })),
    /ca-dir-not-owned-by-runner/
  );
  assert.equal(check(caStat(), undefined, dirStat({ uid: 0 })), '/ca.pem');
  assert.equal(check(caStat()), '/ca.pem');
  assert.throws(() => check(null), /ca-file-not-regular/);
  assert.throws(
    () => check(caStat({ isFile: () => false })),
    /ca-file-not-regular/
  );
  assert.throws(
    () => check(caStat({ mode: 0o100666 })),
    /ca-file-group-or-world-writable/
  );
  assert.throws(
    () => check(caStat({ mode: 0o100664 })),
    /ca-file-group-or-world-writable/
  );
  assert.throws(
    () => check(caStat({ uid: uid + 1 })),
    /ca-file-not-owned-by-runner/
  );
  assert.throws(
    () =>
      check(caStat(), () => {
        throw new Error('EACCES');
      }),
    /ca-file-unreadable/
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-ca-'));
  try {
    const file = path.join(dir, 'ca.pem');
    fs.writeFileSync(file, 'fixture');
    fs.chmodSync(file, 0o600);
    assert.equal(assertCaFile(file), file);
    fs.symlinkSync(file, path.join(dir, 'link.pem'));
    assert.throws(
      () => assertCaFile(path.join(dir, 'link.pem')),
      /not-regular/
    );
    fs.chmodSync(dir, 0o777);
    assert.throws(() => assertCaFile(file), /ca-dir-group-or-world-writable/);
    fs.chmodSync(dir, 0o700);
    fs.chmodSync(file, 0o666);
    assert.throws(() => assertCaFile(file), /world-writable/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
