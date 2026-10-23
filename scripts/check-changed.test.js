const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  hookDecision,
  main,
  parseArgs,
  parseNameStatus,
  resolveBase,
  runChecks,
  runStep,
  runTypeCheck,
  selectSteps,
  ttrPrefix,
} = require('./check-changed.js');

function fakeGit(responses) {
  return (command, args) => {
    const key = [command, ...args].join(' ');
    for (const [pattern, value] of Object.entries(responses)) {
      if (key.startsWith(pattern)) {
        if (value instanceof Error) throw value;
        return value;
      }
    }
    throw new Error(`unexpected command: ${key}`);
  };
}

test('parseArgs handles flags, hooks and trailing file lists', () => {
  const options = parseArgs([
    '--base',
    'origin/main',
    '--only',
    'biome',
    '--skip',
    'type-check',
    '--no-ttr',
    '--files',
    'a.ts',
    'b.ts',
  ]);
  assert.equal(options.base, 'origin/main');
  assert.deepEqual(options.only, ['biome']);
  assert.deepEqual(options.skip, ['type-check']);
  assert.equal(options.ttr, false);
  assert.deepEqual(options.files, ['a.ts', 'b.ts']);
  const hook = parseArgs(['--hook']);
  assert.equal(hook.hook, true);
  assert.equal(hook.committed, true);
  assert.throws(() => parseArgs(['--base']), /Missing value/);
  assert.throws(() => parseArgs(['--wat']), /Unknown argument/);
});

test('parseNameStatus keeps the status letter and path', () => {
  assert.deepEqual(parseNameStatus('M\tscripts/a.js\nD\tb.ts\n'), [
    { status: 'M', file: 'scripts/a.js' },
    { status: 'D', file: 'b.ts' },
  ]);
});

test('resolveBase prefers the origin/main merge base, even when equal to HEAD', () => {
  assert.equal(
    resolveBase(null, fakeGit({ 'git merge-base': 'abc\n' })),
    'abc'
  );
  assert.equal(
    resolveBase(
      null,
      fakeGit({
        'git merge-base': new Error('no origin/main'),
        'git rev-parse --verify HEAD^': 'parent\n',
      })
    ),
    'parent'
  );
  assert.equal(
    resolveBase('origin/main', fakeGit({ 'git rev-parse --verify': 'def\n' })),
    'def'
  );
});

test('hookDecision requires opt-in and a HEAD push', () => {
  const head = 'a'.repeat(40);
  const execFile = (value) =>
    fakeGit({ 'git config': value, 'git rev-parse HEAD': `${head}\n` });
  const stdin = `refs/heads/x ${head} refs/heads/x ${'0'.repeat(40)}\n`;
  assert.deepEqual(
    hookDecision({ stdin, env: {}, execFile: execFile(new Error('unset')) }),
    { run: false, reason: 'not opted in' }
  );
  assert.deepEqual(
    hookDecision({ stdin, env: {}, execFile: execFile('true\n') }),
    { run: true }
  );
  assert.equal(
    hookDecision({
      stdin,
      env: { TUTURUUU_PRE_PUSH: '0' },
      execFile: execFile('true\n'),
    }).run,
    false
  );
  assert.equal(
    hookDecision({
      stdin: `(delete) ${'0'.repeat(40)} refs/heads/x ${head}\n`,
      env: { TUTURUUU_PRE_PUSH: '1' },
      execFile: execFile(new Error('unset')),
    }).reason,
    'nothing to check'
  );
  assert.match(
    hookDecision({
      stdin: `refs/heads/y ${'b'.repeat(40)} refs/heads/y ${head}\n`,
      env: { TUTURUUU_PRE_PUSH: '1' },
      execFile: execFile(new Error('unset')),
    }).reason,
    /not HEAD/
  );
});

test('ttrPrefix queues heavy work only when resources are enabled', () => {
  const enabled = () => JSON.stringify({ installed: true, enabled: true });
  assert.deepEqual(ttrPrefix(true, enabled), ['ttr', 'resources', 'run', '--']);
  assert.equal(ttrPrefix(false, enabled), null);
  assert.equal(
    ttrPrefix(true, () => JSON.stringify({ installed: true, enabled: false })),
    null
  );
  assert.equal(
    ttrPrefix(true, () => {
      throw new Error('ENOENT');
    }),
    null
  );
});

test('selectSteps matches ids and workspace-qualified prefixes', () => {
  const steps = [
    { id: 'biome' },
    { id: 'type-check:apps/web' },
    { id: 'vitest:apps/web' },
  ];
  assert.deepEqual(
    selectSteps(steps, ['type-check'], []).map((step) => step.id),
    ['type-check:apps/web']
  );
  assert.deepEqual(
    selectSteps(steps, [], ['vitest', 'biome']).map((step) => step.id),
    ['type-check:apps/web']
  );
});

test('runStep queues heavy commands through ttr and reports advisories', () => {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd });
    return { status: 1, stdout: 'lint output', stderr: '' };
  };
  const context = {
    root: '/repo',
    env: {},
    spawn,
    ttr: ['ttr', 'resources', 'run', '--'],
  };
  const heavy = runStep(
    {
      id: 'flutter-analyze',
      command: 'flutter',
      args: ['analyze'],
      cwd: 'apps/mobile',
      heavy: true,
    },
    context
  );
  assert.equal(heavy.status, 'fail');
  assert.deepEqual(calls[0], {
    command: 'ttr',
    args: ['resources', 'run', '--', 'flutter', 'analyze'],
    cwd: path.join('/repo', 'apps/mobile'),
  });
  const advisory = runStep(
    { id: 'oxlint', command: 'node', args: ['x'], advisory: true },
    context
  );
  assert.equal(advisory.status, 'advisory');
  assert.equal(calls[1].command, 'node');
  assert.equal(
    runStep({ id: 'b', inline: () => true }, context).status,
    'pass'
  );
});

test('runChecks stops after the first failure in fail-fast mode', () => {
  const logs = [];
  const steps = [
    { id: 'a', label: 'a', inline: () => false, failureHint: 'fix a' },
    { id: 'b', label: 'b', inline: () => true },
  ];
  const results = runChecks(steps, { failFast: true }, (line) =>
    logs.push(line)
  );
  assert.equal(results.length, 1);
  assert.match(logs.join('\n'), /FAIL a[\s\S]*hint: fix a/);
});

test('runTypeCheck blocks only on changed-file errors while declarations are cold', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-changed-tc-'));
  fs.mkdirSync(path.join(root, 'apps/web'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'apps/web/package.json'),
    JSON.stringify({ scripts: { 'type-check': 'tsc -p tsconfig.json' } })
  );
  fs.writeFileSync(path.join(root, 'apps/web/tsconfig.json'), '{}');
  const output = [
    "apps/web/src/a.ts(1,1): error TS2307: Cannot find module '@tuturuuu/types' or its corresponding type declarations.",
    'apps/web/src/b.ts(2,3): error TS2322: Broken.',
    'apps/web/src/c.ts(4,5): error TS2339: Cascade.',
  ].join('\n');
  const calls = [];
  const context = {
    root,
    env: {},
    changedFiles: new Set(['apps/web/src/b.ts']),
    missing: new Map([['@tuturuuu/types', 'packages/types']]),
    checkerFor: () => ['tsc'],
    spawn: (command, args) => {
      calls.push([command, ...args]);
      return { status: 2, stdout: output, stderr: '' };
    },
  };
  const result = runTypeCheck(
    { typeCheck: { workspace: 'apps/web' } },
    context
  );
  assert.equal(calls[0][2], 'apps/web/tsconfig.json');
  assert.equal(result.status, 'fail');
  assert.equal(result.output, 'apps/web/src/b.ts(2,3): error TS2322: Broken.');
  assert.match(result.detail, /1 missing-dist ignored, 1 advisory/);

  context.changedFiles = new Set();
  assert.equal(
    runTypeCheck({ typeCheck: { workspace: 'apps/web' } }, context).status,
    'pass'
  );
});

test('main prints the plan in dry-run mode and exits cleanly without changes', () => {
  const logs = [];
  const execFile = fakeGit({
    'git merge-base': 'base\n',
    'git diff --name-status': 'M\tscripts/check-changed.js\n',
    'git ls-files': '',
    'git branch --show-current': 'chore/x\n',
  });
  assert.equal(
    main(['--dry-run', '--no-ttr'], {
      execFile,
      log: (line) => logs.push(line),
    }),
    0
  );
  assert.match(logs.join('\n'), /biome: .*check-changed\.js/);
  assert.match(logs.join('\n'), /script-tests: node --test/);

  const empty = fakeGit({
    'git merge-base': 'base\n',
    'git diff --name-status': '',
    'git ls-files': '',
  });
  const quiet = [];
  assert.equal(
    main([], { execFile: empty, log: (line) => quiet.push(line) }),
    0
  );
  assert.match(quiet[0], /no changed files/);
});

test('the pre-push hook passes stdin refs but not git positional args', () => {
  const hook = fs.readFileSync(
    path.join(__dirname, '..', '.githooks', 'pre-push'),
    'utf8'
  );
  assert.match(hook, /^exec node scripts\/check-changed\.js --hook$/m);
  assert.doesNotMatch(hook, /"\$@"/);
});

test('main exits early from the hook when not opted in', () => {
  const logs = [];
  const execFile = fakeGit({ 'git config': new Error('unset') });
  assert.equal(
    main(['--hook'], {
      execFile,
      env: {},
      stdin: '',
      log: (l) => logs.push(l),
    }),
    0
  );
  assert.deepEqual(logs, []);
});
