import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  resolveVersion,
  restore,
} from '../../.github/actions/setup-supabase-cli-with-retry/runtime.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const actionPath = path.join(
  root,
  '.github/actions/setup-supabase-cli-with-retry'
);
const action = JSON.parse(
  execFileSync(
    'ruby',
    [
      '-ryaml',
      '-rjson',
      '-e',
      'puts JSON.generate(YAML.load_file(ARGV[0]))',
      path.join(actionPath, 'action.yml'),
    ],
    { encoding: 'utf8' }
  )
);
const fixture = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-action-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const writeLock = (dir, version = '2.117.0') =>
  fs.writeFileSync(
    path.join(dir, 'bun.lock'),
    JSON.stringify({
      workspaces: {
        'apps/database': { devDependencies: { supabase: '^2.117.0' } },
      },
      packages: { supabase: [`supabase@${version}`] },
    })
  );

test('resolves root lock independently of action cwd and rejects missing, malformed and nonstable pins', (t) => {
  const dir = fixture(t);
  assert.throws(() => resolveVersion(dir));
  fs.writeFileSync(path.join(dir, 'bun.lock'), '{broken');
  assert.throws(() => resolveVersion(dir));
  for (const version of ['latest', '2.117.0-beta.1', '^2.117.0']) {
    writeLock(dir, version);
    assert.throws(() => resolveVersion(dir));
    assert.throws(() => resolveVersion(dir, version));
  }
  writeLock(dir);
  assert.equal(resolveVersion(dir), '2.117.0');
  assert.equal(resolveVersion(dir, '2.118.0'), '2.118.0');
  assert.match(resolveVersion(root), /^\d+\.\d+\.\d+$/);
});

test('temporary home protects Bun; restoration keeps CLI available and detects overwritten runtime', (t) => {
  const dir = fixture(t);
  const bin = path.join(dir, 'repo-bin');
  fs.mkdirSync(bin);
  const bun = path.join(bin, 'bun');
  fs.writeFileSync(bun, '#!/bin/sh\necho 1.4.1\n', { mode: 0o755 });
  writeLock(dir);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    GITHUB_WORKSPACE: dir,
    RUNNER_TEMP: dir,
    GITHUB_OUTPUT: path.join(dir, 'outputs'),
    GITHUB_PATH: path.join(dir, 'paths'),
    REQUESTED_VERSION: '',
  };
  execFileSync('node', [path.join(actionPath, 'runtime.mjs'), 'prepare'], {
    cwd: actionPath,
    env,
  });
  const outputs = Object.fromEntries(
    fs
      .readFileSync(env.GITHUB_OUTPUT, 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at), line.slice(at + 1)];
      })
  );
  assert.equal(outputs.version, '2.117.0');
  assert.notEqual(outputs['installer-home'], os.homedir());
  const installerBin = path.join(outputs['installer-home'], '.bun/bin');
  fs.mkdirSync(installerBin, { recursive: true });
  fs.writeFileSync(
    path.join(installerBin, 'bun'),
    '#!/bin/sh\necho installer\n',
    { mode: 0o755 }
  );
  fs.writeFileSync(
    path.join(installerBin, 'supabase'),
    '#!/bin/sh\necho CLI\n',
    { mode: 0o755 }
  );
  env.REPO_BUN = outputs['repo-bun'];
  env.REPO_BUN_VERSION = outputs['repo-bun-version'];
  env.PATH = `${installerBin}:${env.PATH}`;
  execFileSync('node', [path.join(actionPath, 'runtime.mjs'), 'restore'], {
    env,
  });
  env.PATH = `${fs.readFileSync(env.GITHUB_PATH, 'utf8').trim()}:${env.PATH}`;
  assert.equal(
    execFileSync('bun', ['--version'], { env, encoding: 'utf8' }).trim(),
    '1.4.1'
  );
  assert.equal(
    execFileSync('supabase', [], { env, encoding: 'utf8' }).trim(),
    'CLI'
  );
  fs.writeFileSync(bun, '#!/bin/sh\necho changed\n');
  assert.notEqual(
    spawnSync('node', [path.join(actionPath, 'runtime.mjs'), 'restore'], {
      env,
    }).status,
    0
  );
});

// Execute the actual composite conditions, using a stub instead of the remote installer.
function runComposite(failures, steps = action.runs.steps) {
  const outcomes = {};
  const events = [];
  const delays = [];
  let attempts = 0;
  let failed = false;
  let restored = false;
  for (const step of steps) {
    const condition = (step.if || 'true')
      .replace(/always\(\)/g, 'true')
      .replace(/steps\.([\w-]+)\.outcome/g, (_, id) =>
        JSON.stringify(outcomes[id])
      );
    if (!Function(`return (${condition})`)()) continue;
    if (step.id === 'prepare') outcomes.prepare = 'success';
    else if (step.uses) {
      outcomes[step.id] = ++attempts <= failures ? 'failure' : 'success';
      if (outcomes[step.id] === 'failure' && !step['continue-on-error'])
        failed = true;
    } else if (step.run.startsWith('sleep '))
      delays.push(Number(step.run.slice(6)));
    else if (step.run.includes('restore')) {
      restored = true;
      events.push('restore');
    } else if (step.run === 'exit 1') {
      failed = true;
      events.push('exhausted-exit');
    }
  }
  return { attempts, delays, failed, restored, events };
}

test('actual composite retries transient failures and propagates exhausted retries after restoration', () => {
  assert.deepEqual(runComposite(0), {
    attempts: 1,
    delays: [],
    failed: false,
    restored: true,
    events: ['restore'],
  });
  assert.deepEqual(runComposite(1), {
    attempts: 2,
    delays: [5],
    failed: false,
    restored: true,
    events: ['restore'],
  });
  assert.deepEqual(runComposite(3), {
    attempts: 4,
    delays: [5, 10, 20],
    failed: false,
    restored: true,
    events: ['restore'],
  });
  assert.deepEqual(runComposite(4), {
    attempts: 4,
    delays: [5, 10, 20],
    failed: true,
    restored: true,
    events: ['restore', 'exhausted-exit'],
  });
});

test('retry ordering detects an exhausted exit moved before restoration', () => {
  const steps = structuredClone(action.runs.steps);
  const failure = steps.findIndex((step) => step.run === 'exit 1');
  const restoreAt = steps.findIndex((step) => step.run?.includes(' restore'));
  assert.ok(restoreAt >= 0 && failure > restoreAt);
  const [exit] = steps.splice(failure, 1);
  steps.splice(restoreAt, 0, exit);
  assert.deepEqual(runComposite(4, steps).events, [
    'exhausted-exit',
    'restore',
  ]);
  assert.notDeepEqual(runComposite(4, steps).events, runComposite(4).events);
});

function assertCallerCheckouts(workflow) {
  for (const [jobId, job] of Object.entries(workflow.jobs || {})) {
    const steps = job.steps || [];
    for (const [index, step] of steps.entries()) {
      if (step.uses !== './.github/actions/setup-supabase-cli-with-retry')
        continue;
      const preceding = steps.slice(0, index);
      assert.ok(
        preceding.some(
          (candidate) =>
            candidate.uses?.startsWith('actions/checkout@') &&
            candidate.if === undefined
        ),
        `${jobId}: Supabase setup at step ${index} requires a preceding checkout`
      );
    }
  }
}

test('caller checkout validation rejects missing, late and cross-job checkouts', () => {
  const checkout = { uses: 'actions/checkout@v7' };
  const setup = { uses: './.github/actions/setup-supabase-cli-with-retry' };
  assert.doesNotThrow(() =>
    assertCallerCheckouts({
      jobs: { good: { steps: [checkout, setup, setup] } },
    })
  );
  for (const jobs of [
    { missing: { steps: [setup] } },
    { skipped: { steps: [{ ...checkout, if: 'false' }, setup] } },
    { late: { steps: [setup, checkout, setup] } },
    { good: { steps: [checkout, setup] }, bad: { steps: [setup] } },
  ])
    assert.throws(
      () => assertCallerCheckouts({ jobs }),
      /requires a preceding checkout/
    );
});

test('installer passes only supported explicit version and scoped home; callers checkout before setup', () => {
  assert.deepEqual(Object.keys(action.inputs), ['version']);
  const installers = action.runs.steps.filter((step) => step.uses);
  assert.equal(installers.length, 4);
  for (const step of installers) {
    assert.equal(
      step.uses,
      'supabase/setup-cli@45a513f8c64c0bc8e0e3dfe572b5c95be85f6359'
    );
    assert.deepEqual(Object.keys(step.with), ['version']);
    assert.match(
      step.with.version,
      /^\$\{\{ steps\.prepare\.outputs\.version \}\}$/
    );
    assert.match(
      step.env.HOME,
      /^\$\{\{ steps\.prepare\.outputs\.installer-home \}\}$/
    );
  }
  for (const name of fs.readdirSync(path.join(root, '.github/workflows'))) {
    const source = fs.readFileSync(
      path.join(root, '.github/workflows', name),
      'utf8'
    );
    assert.doesNotMatch(source, /uses: supabase\/setup-cli@/);
    if (source.includes('./.github/actions/setup-supabase-cli-with-retry')) {
      const workflow = JSON.parse(
        execFileSync(
          'ruby',
          [
            '-ryaml',
            '-rjson',
            '-e',
            'puts JSON.generate(YAML.load_file(ARGV[0]))',
            path.join(root, '.github/workflows', name),
          ],
          { encoding: 'utf8' }
        )
      );
      assertCallerCheckouts(workflow);
      assert.doesNotMatch(source, /github-token:/);
    }
  }
});

test('jobs without repository Bun do not invent a restoration path', () => {
  assert.doesNotThrow(() => restore({ REPO_BUN: '', REPO_BUN_VERSION: '' }));
  assert.throws(() =>
    restore({ REPO_BUN: 'relative', REPO_BUN_VERSION: '1.4.1' })
  );
});
