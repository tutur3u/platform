import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  frozenSetupCommands,
  runFrozenProfileSetup,
} from './mail-profile-runtime-setup.mjs';

const root = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const commands = [
  ['bun', ['install', '--frozen-lockfile']],
  ['bun', ['portless:setup']],
  [
    'bun',
    [
      'turbo:local',
      'run',
      'build',
      '-F',
      '@tuturuuu/types',
      '-F',
      '@tuturuuu/supabase',
      '-F',
      '@tuturuuu/masonry',
      '-F',
      '@tuturuuu/internal-api',
      '-F',
      'tuturuuu',
    ],
  ],
];

test('frozen profile setup preserves every current normal setup prerequisite', () => {
  assert.deepEqual(frozenSetupCommands(root.scripts.setup), commands);
});

test('setup drift fails before source reads or prerequisite execution', () => {
  let calls = 0;
  assert.throws(() =>
    runFrozenProfileSetup({
      setup: `${root.scripts.setup} && bun other-build`,
      run: () => calls++,
    })
  );
  assert.equal(calls, 0);
});

test('frozen setup runs once in order and requires clean source on both sides', () => {
  const calls = [];
  runFrozenProfileSetup({
    setup: root.scripts.setup,
    run: (binary, args, capture) => {
      calls.push([binary, args, capture]);
      return { status: 0, stdout: '' };
    },
  });
  assert.deepEqual(calls, [
    ['git', ['status', '--porcelain'], true],
    ...commands.map(([binary, args]) => [binary, args, false]),
    ['git', ['status', '--porcelain'], true],
  ]);
});

test('dirty source is rejected before any setup command', () => {
  let calls = 0;
  assert.throws(() =>
    runFrozenProfileSetup({
      setup: root.scripts.setup,
      run: () => {
        calls++;
        return { status: 0, stdout: ' M bun.lock' };
      },
    })
  );
  assert.equal(calls, 1);
});

test('a failed frozen install stops without portless or builds and never retries', () => {
  const calls = [];
  assert.throws(() =>
    runFrozenProfileSetup({
      setup: root.scripts.setup,
      run: (binary, args) => {
        calls.push([binary, args]);
        return { status: binary === 'git' ? 0 : 1, stdout: '' };
      },
    })
  );
  assert.deepEqual(calls, [['git', ['status', '--porcelain']], commands[0]]);
});

test('setup-generated dirtiness remains a failure even after successful commands', () => {
  let statuses = 0;
  assert.throws(() =>
    runFrozenProfileSetup({
      setup: root.scripts.setup,
      run: (binary) => ({
        status: 0,
        stdout: binary === 'git' && statuses++ ? ' M bun.lock' : '',
      }),
    })
  );
  assert.equal(statuses, 2);
});

test('the owning workflow queues frozen setup and both real contract suites', () => {
  const workflow = fs.readFileSync(
    '.github/workflows/mail-profile-runtime-contract.yaml',
    'utf8'
  );
  assert.match(
    workflow,
    /resources-entry\.ts run -- node scripts\/ci\/mail-profile-runtime-setup\.mjs/u
  );
  assert.match(
    workflow,
    /node --test .*mail-profile-runtime-setup\.test\.mjs/u
  );
  assert.doesNotMatch(workflow, /resources-entry\.ts run -- bun setup/u);
});
