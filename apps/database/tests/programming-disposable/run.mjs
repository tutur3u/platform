import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// One admitted normal-FIFO stage. Never execute against any supplied DB URL.
const here = import.meta.dirname;
const repo = path.resolve(here, '../../../..');
const project = 'ttr-learn-programming-fixture-20261001';
const volume = `${project}-data`;
const port = '55439';
const image =
  'sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f';
const start = Date.now();
const deadline = start + 18 * 60_000; // reserve2minutes for cleanup within20minutes
const evidence = {
  project,
  image,
  port,
  startedAt: new Date(start).toISOString(),
  assertions: [],
  cleanup: {},
};
let containerId,
  volumeOwned = false;
const timeout = () => Math.min(30_000, Math.max(1, deadline - Date.now()));
function command(binary, args, options = {}) {
  if (Date.now() >= deadline)
    throw new Error('Fixture execution budget expired');
  return execFileSync(binary, args, {
    encoding: 'utf8',
    timeout: timeout(),
    ...options,
  }).trim();
}
function docker(args, options) {
  return command('docker', args, options);
}
function disk() {
  const fields = command('df', ['-k', repo])
    .split('\n')
    .at(-1)
    .trim()
    .split(/\s+/);
  return Number(fields[3]);
}
function inventory() {
  return {
    containers: docker(['ps', '-aq', '--no-trunc'])
      .split('\n')
      .filter(Boolean)
      .sort(),
    volumes: docker(['volume', 'ls', '-q']).split('\n').filter(Boolean).sort(),
    networks: docker(['network', 'ls', '-q', '--no-trunc'])
      .split('\n')
      .filter(Boolean)
      .sort(),
  };
}
function guard() {
  if (disk() < 9 * 1024 * 1024) throw new Error('Free disk below9GiB');
  if (containerId) {
    const size = Number(
      docker([
        'exec',
        containerId,
        'du',
        '-sk',
        '/var/lib/postgresql/data',
      ]).split(/\s+/)[0]
    );
    if (size > 1000 * 1024) throw new Error('Fixture volume exceeds1GiB');
    evidence.maxVolumeKiB = Math.max(evidence.maxVolumeKiB ?? 0, size);
  }
}
function sql(text, database = 'fixture') {
  guard();
  return docker(
    [
      'exec',
      '-i',
      containerId,
      'psql',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      database,
    ],
    { input: text }
  );
}
const baseline = fs.readFileSync(path.join(here, 'baseline.sql'), 'utf8');
const old = fs.readFileSync(
  path.join(
    repo,
    'apps/database/supabase/migrations/20260929160000_learn_coding_execution_history.sql'
  ),
  'utf8'
);
const migration = fs.readFileSync(
  path.join(
    repo,
    'apps/database/supabase/migrations/20261001140000_learn_programming_problem_catalog.sql'
  ),
  'utf8'
);
const tests = fs.readFileSync(path.join(here, 'assertions.sql'), 'utf8');
evidence.migrationSha256 = crypto
  .createHash('sha256')
  .update(migration)
  .digest('hex');
let before;
try {
  evidence.diskBeforeKiB = disk();
  assert.ok(evidence.diskBeforeKiB >= 10 * 1024 * 1024, 'Need10GiB free disk');
  assert.equal(
    docker(['image', 'inspect', image, '--format', '{{.Id}}']),
    image
  );
  before = inventory();
  assert.ok(
    !docker(['ps', '-a', '--format', '{{.Names}}'])
      .split('\n')
      .includes(project),
    'Container name already exists'
  );
  assert.ok(!before.volumes.includes(volume), 'Volume already exists');
  // A localhost listener is a collision; exit1 from lsof means no listener.
  try {
    command('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN']);
    throw new Error('Port collision');
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  evidence.baseline = before;
  assert.equal(
    docker(['volume', 'create', '--label', `ttr.fixture=${project}`, volume]),
    volume
  );
  volumeOwned = true;
  containerId = docker(
    [
      'create',
      '--pull=never',
      '--name',
      project,
      '--label',
      `ttr.fixture=${project}`,
      '--cpus=2',
      '--memory=2g',
      '--memory-swap=2g',
      '--log-opt=max-size=10m',
      '--log-opt=max-file=2',
      '-p',
      `127.0.0.1:${port}:5432`,
      '-v',
      `${volume}:/var/lib/postgresql/data`,
      '-e',
      'POSTGRES_PASSWORD',
      '-e',
      'POSTGRES_DB=fixture',
      image,
    ],
    {
      env: {
        ...process.env,
        POSTGRES_PASSWORD: crypto.randomBytes(24).toString('hex'),
      },
    }
  );
  evidence.containerId = containerId;
  evidence.volumeIdentity = docker([
    'volume',
    'inspect',
    volume,
    '--format',
    '{{.Name}} {{index .Labels "ttr.fixture"}}',
  ]);
  assert.equal(evidence.volumeIdentity, `${volume} ${project}`);
  docker(['start', containerId]);
  for (let attempts = 0; attempts < 20; attempts++) {
    try {
      docker(['exec', containerId, 'pg_isready', '-U', 'postgres']);
      break;
    } catch (error) {
      if (attempts === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  sql(baseline);
  sql(old);
  sql(migration);
  evidence.assertions.push('populated synthetic baseline migration');
  console.log(sql(tests));
  evidence.assertions.push(
    'RLS/RPC grants, hidden case shapes, case rollback, stale edit/enqueue, parent guard, ready-runner guard, binding permanence and workspace deletion'
  );
  // Empty synthetic baseline: omit legacy rows; roles already exist cluster-wide.
  sql('create database fixture_empty;', 'postgres');
  const empty = baseline
    .replace(/^create role .*;\n/gm, '')
    .split('-- Pre-migration legacy history')[0];
  sql(empty, 'fixture_empty');
  sql(old, 'fixture_empty');
  sql(migration, 'fixture_empty');
  assert.ok(
    sql(
      'select count(*) from private.learn_programming_problems where ws_id is null;',
      'fixture_empty'
    )
      .split(/\r?\n/u)
      .some((line) => line.trim() === '3')
  );
  evidence.assertions.push('empty synthetic baseline migration');
  // Two psql sessions, still inside this single admitted FIFO/container budget.
  const ws = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const actor = '11111111-1111-4111-8111-111111111111';
  const authorPayload = JSON.stringify({
    slug: 'concurrent',
    title: { en: 'Synthetic', vi: 'Thử nghiệm' },
    prompt: { en: 'Add', vi: 'Cộng' },
    difficulty: 'easy',
    topic: 'arrays',
    starterCode: '',
    status: 'published',
    cases: [{ input: 'old', expected: 'old', visible: true }],
  });
  const created = sql(
    `select private.save_learn_programming_problem('${ws}','${actor}','${authorPayload}'::jsonb)->>'id';`,
    'fixture_empty'
  );
  const id = created.match(/[0-9a-f]{8}-[0-9a-f-]{27}/)?.[0];
  assert.ok(id, 'Missing concurrent fixture identity');
  function session(text) {
    let output = '',
      errors = '',
      announce;
    const locked = new Promise((resolve) => {
      announce = resolve;
    });
    const child = spawn(
      'docker',
      [
        'exec',
        '-i',
        containerId,
        'psql',
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'fixture_empty',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const timer = setTimeout(() => child.kill('SIGTERM'), timeout());
    child.stdout.on('data', (data) => {
      output += data;
      if (output.includes('FIXTURE_LOCKED')) announce();
    });
    child.stderr.on('data', (data) => {
      errors += data;
    });
    const done = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(timer);
        if (!output.includes('FIXTURE_LOCKED')) announce();
        resolve({ code, output, errors });
      });
    });
    child.stdin.end(text);
    return { locked, done };
  }
  const updatedPayload = JSON.stringify({
    ...JSON.parse(authorPayload),
    cases: [{ input: 'new', expected: 'new', visible: true }],
  });
  const save = (revision, value = updatedPayload) =>
    `select private.save_learn_programming_problem('${ws}','${actor}','${value}'::jsonb,'${id}',${revision});`;
  let writer = session(
    `begin; ${save(1)} select 'FIXTURE_LOCKED'; select pg_sleep(1); commit;`
  );
  await writer.locked;
  let competing = session(save(1));
  assert.equal((await writer.done).code, 0);
  let rejected = await competing.done;
  assert.notEqual(rejected.code, 0);
  assert.ok(rejected.errors.includes('Problem revision conflict'));
  evidence.assertions.push(
    'concurrent author revision rejects stale second writer'
  );
  writer = session(
    `begin; ${save(2)} select 'FIXTURE_LOCKED'; select pg_sleep(1); commit;`
  );
  await writer.locked;
  competing = session(
    `select private.enqueue_learn_programming_execution('${ws}','${actor}','${actor}','${id}',2,'x',array['__ttr_judge_v1__','eA'],'python','submit');`
  );
  assert.equal((await writer.done).code, 0);
  rejected = await competing.done;
  assert.notEqual(rejected.code, 0);
  assert.ok(rejected.errors.includes('Problem revision conflict'));
  evidence.assertions.push('concurrent edit/enqueue rejects stale snapshot');
  const archived = JSON.stringify({
    ...JSON.parse(updatedPayload),
    status: 'archived',
  });
  writer = session(
    `begin; ${save(3, archived)} select 'FIXTURE_LOCKED'; select pg_sleep(1); commit;`
  );
  await writer.locked;
  competing = session(
    `select private.enqueue_learn_programming_execution('${ws}','${actor}','${actor}','${id}',3,'x',array['__ttr_judge_v1__','eA'],'python','submit');`
  );
  assert.equal((await writer.done).code, 0);
  rejected = await competing.done;
  assert.notEqual(rejected.code, 0);
  assert.ok(rejected.errors.includes('Problem revision conflict'));
  evidence.assertions.push('concurrent archive/enqueue rejects stale snapshot');
  guard();
  console.log(
    'Fixture SQL checks passed. This minimal prerequisite schema is NOT a full production migration/typegen proof.'
  );
} catch (error) {
  evidence.error = error.message;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  // Cleanup only IDs/names created by this stage, after ownership-label proof.
  try {
    if (containerId) {
      assert.equal(
        execFileSync(
          'docker',
          [
            'inspect',
            containerId,
            '--format',
            '{{index .Config.Labels "ttr.fixture"}}',
          ],
          { encoding: 'utf8', timeout: 10_000 }
        ).trim(),
        project
      );
      execFileSync('docker', ['rm', '-f', containerId], { timeout: 10_000 });
      evidence.cleanup.containerRemoved = true;
    }
    if (volumeOwned) {
      assert.equal(
        execFileSync(
          'docker',
          [
            'volume',
            'inspect',
            volume,
            '--format',
            '{{index .Labels "ttr.fixture"}}',
          ],
          { encoding: 'utf8', timeout: 10_000 }
        ).trim(),
        project
      );
      execFileSync('docker', ['volume', 'rm', volume], { timeout: 10_000 });
      evidence.cleanup.volumeRemoved = true;
    }
    // Restore time for bounded read-only cleanup verification, no extra work.
    const after = {
      containers: execFileSync('docker', ['ps', '-aq', '--no-trunc'], {
        encoding: 'utf8',
        timeout: 10_000,
      })
        .trim()
        .split('\n')
        .filter(Boolean)
        .sort(),
      volumes: execFileSync('docker', ['volume', 'ls', '-q'], {
        encoding: 'utf8',
        timeout: 10_000,
      })
        .trim()
        .split('\n')
        .filter(Boolean)
        .sort(),
      networks: execFileSync('docker', ['network', 'ls', '-q', '--no-trunc'], {
        encoding: 'utf8',
        timeout: 10_000,
      })
        .trim()
        .split('\n')
        .filter(Boolean)
        .sort(),
    };
    if (before)
      assert.deepEqual(after, before, 'Unrelated Docker identities changed');
    evidence.cleanup.unrelatedUnchanged = true;
    verifyPortClosed();
    evidence.cleanup.portClosed = true;
    evidence.diskAfter = execFileSync('df', ['-k', repo], {
      encoding: 'utf8',
      timeout: 10_000,
    }).trim();
  } catch (error) {
    evidence.cleanup.error = error.message;
    process.exitCode = 1;
  }
  evidence.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.join(here, 'evidence'), { recursive: true });
  fs.writeFileSync(
    path.join(here, 'evidence/results.json'),
    JSON.stringify(evidence, null, 2)
  );
}

function verifyPortClosed() {
  try {
    execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      timeout: 10_000,
    });
  } catch (error) {
    if (error.status === 1) return;
    throw error;
  }
  throw new Error('Port remains open');
}
