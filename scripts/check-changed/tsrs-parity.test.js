const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runChecks } = require('../check-changed.js');

test('REV-6468-6: mixed projects gate tsrs per project and print advisory parity on passes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'changed-tsrs-parity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'apps/tasks');
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(
    path.join(workspace, 'package.json'),
    JSON.stringify({
      scripts: {
        'type-check': 'tsc -p tsconfig.json && tsc -p tsconfig.worker.json',
      },
    })
  );
  for (const project of ['tsconfig.json', 'tsconfig.worker.json']) {
    fs.writeFileSync(path.join(workspace, project), '{}');
  }
  const calls = [];
  const logs = [];
  const extra = 'apps/tasks/src/a.ts(1,1): error TS2322: tsrs-only message.';
  const missing = 'apps/tasks/src/a.ts(2,1): error TS2339: tsc-only message.';
  const context = {
    root,
    env: {},
    checker: 'tsrs',
    checkers: { tsc: ['tsc'], tsrs: ['tsrs'] },
    changedFiles: new Set(),
    missing: new Map(),
    spawn: (command, args) => {
      calls.push([command, args[1]]);
      return {
        status: command === 'tsrs' ? 2 : 0,
        stdout: command === 'tsrs' ? extra : '',
      };
    },
  };
  const steps = [
    {
      id: 'type-check:apps/tasks',
      label: 'tasks',
      typeCheck: { workspace: 'apps/tasks' },
    },
  ];
  let results = runChecks(steps, context, (line) => logs.push(line));
  assert.deepEqual(calls, [
    ['tsrs', 'apps/tasks/tsconfig.json'],
    ['tsc', 'apps/tasks/tsconfig.json'],
    ['tsc', 'apps/tasks/tsconfig.worker.json'],
  ]);
  assert.equal(results[0].status, 'pass');
  assert.match(
    logs.join('\n'),
    /advisory tsrs parity .*1 tsrs-only, 0 tsc-only/
  );
  assert.ok(logs.join('\n').includes(`[tsrs-only] ${extra}`));

  logs.length = 0;
  context.spawn = (command) => ({
    status: command === 'tsc' ? 2 : 0,
    stdout: command === 'tsc' ? missing : '',
  });
  results = runChecks(steps, context, (line) => logs.push(line));
  assert.equal(results[0].status, 'fail');
  assert.ok(logs.join('\n').includes(`[tsc-only] ${missing}`));

  logs.length = 0;
  context.spawn = (command) => ({
    status: command === 'tsrs' ? 1 : 0,
    stdout: '',
  });
  results = runChecks(steps, context, (line) => logs.push(line));
  assert.equal(results[0].status, 'pass');
  assert.match(logs.join('\n'), /advisory tsrs parity .*tsrs crashed/);
});
