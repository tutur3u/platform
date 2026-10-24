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
  assert.equal(parseArgs([]).checker, 'auto');
  assert.equal(parseArgs(['--checker', 'tsc']).checker, 'tsc');
  assert.throws(() => parseArgs(['--checker', 'tsgo']), /--checker must be/);
  assert.throws(() => parseArgs(['--base']), /Missing value/);
  assert.throws(() => parseArgs(['--wat']), /Unknown argument/);
});

test('parseNameStatus keeps the status letter and path', () => {
  assert.deepEqual(parseNameStatus('M\0scripts/a.js\0D\0b.ts\0'), [
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
    fakeGit({
      'git config': value,
      'git rev-parse HEAD': `${head}\n`,
      'git status': '',
    });
  const stdin = `refs/heads/fix/x ${head} refs/heads/fix/x ${'0'.repeat(40)}\n`;
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
      stdin: `(delete) ${'0'.repeat(40)} refs/heads/fix/x ${head}\n`,
      env: { TUTURUUU_PRE_PUSH: '1' },
      execFile: execFile(new Error('unset')),
    }).reason,
    'nothing to check'
  );
  assert.match(
    hookDecision({
      stdin: `refs/heads/fix/y ${'b'.repeat(40)} refs/heads/fix/y ${head}\n`,
      env: { TUTURUUU_PRE_PUSH: '1' },
      execFile: execFile(new Error('unset')),
    }).reason,
    /not HEAD/
  );
});

test('ttrPrefix queues only outside admitted lanes and refuses a broken global CLI', () => {
  const cli = '/trusted/global/ttr';
  const enabled = () => JSON.stringify({ installed: true, enabled: true });
  const prefix = (enabledFlag, exec, env = {}) =>
    ttrPrefix(enabledFlag, exec, env, () => cli);
  assert.deepEqual(prefix(true, enabled), [cli, 'resources', 'run', '--']);
  assert.equal(prefix(false, enabled), null);
  assert.equal(
    prefix(true, () => JSON.stringify({ installed: true, enabled: false })),
    null
  );
  assert.throws(
    () =>
      prefix(true, () => {
        throw new Error('ENOENT');
      }),
    /refusing unadmitted/
  );
  for (const marker of ['TTR_RESOURCES_ADMITTED', 'TTR_RESOURCE_OWNER']) {
    assert.equal(
      ttrPrefix(
        true,
        () => assert.fail('must not probe'),
        { [marker]: 'inherited' },
        () => assert.fail('must not resolve')
      ),
      null
    );
  }
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
    checker: 'tsc',
    checkers: { tsc: ['tsc'], tsrs: null },
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

test('runTypeCheck defaults to tsc and confirms every explicit tsrs result', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-changed-tsrs-'));
  fs.mkdirSync(path.join(root, 'apps/tasks'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'apps/tasks/package.json'),
    JSON.stringify({ scripts: { 'type-check': 'tsc -p tsconfig.json' } })
  );
  fs.writeFileSync(path.join(root, 'apps/tasks/tsconfig.json'), '{}');
  const outputs = { tsrs: '', tsc: '' };
  const calls = [];
  const context = {
    root,
    env: {},
    checker: 'auto',
    checkers: { tsc: ['tsc'], tsrs: ['tsrs'] },
    changedFiles: new Set(['apps/tasks/src/a.ts']),
    missing: new Map(),
    spawn: (command) => {
      calls.push(command);
      return { status: outputs[command] ? 2 : 0, stdout: outputs[command] };
    },
  };
  const step = { typeCheck: { workspace: 'apps/tasks' } };

  let result = runTypeCheck(step, context);
  assert.deepEqual(calls, ['tsc']);
  assert.equal(result.status, 'pass');
  assert.match(result.detail, /^tsc x1/);

  context.checker = 'tsrs';
  calls.length = 0;
  outputs.tsc = 'apps/tasks/src/a.ts(1,1): error TS2322: missed by tsrs.';
  result = runTypeCheck(step, context);
  assert.deepEqual(calls, ['tsrs', 'tsc']);
  assert.equal(result.status, 'fail');
  assert.match(result.output, /missed by tsrs/);
  outputs.tsc = '';

  // A tsrs-only error must not block: tsc decides.
  calls.length = 0;
  outputs.tsrs = 'apps/tasks/src/a.ts(1,1): error TS2322: tsrs only.';
  result = runTypeCheck(step, context);
  assert.deepEqual(calls, ['tsrs', 'tsc']);
  assert.equal(result.status, 'pass');
  assert.match(result.detail, /^tsc x1/);

  // An error both checkers report blocks with tsc's diagnostics.
  calls.length = 0;
  outputs.tsc = 'apps/tasks/src/a.ts(1,1): error TS2322: shared.';
  result = runTypeCheck(step, context);
  assert.equal(result.status, 'fail');
  assert.equal(result.output, outputs.tsc);
});

test('main prints the plan in dry-run mode and exits cleanly without changes', () => {
  const logs = [];
  const execFile = fakeGit({
    'git merge-base': 'base\n',
    'git diff --name-status': 'M\0scripts/check-changed.js\0',
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

test('REV-6467-3: NUL-delimited paths preserve tabs, newlines and spaces', () => {
  const { collectChanges } = require('./check-changed.js');
  const names = ['scripts/a\tb.js', 'scripts/a\nb.js', 'scripts/ space .js'];
  const calls = [];
  const changes = collectChanges('base', false, (_command, args) => {
    calls.push(args);
    if (args[0] === 'diff') return `M\0${names[0]}\0D\0${names[1]}\0`;
    return `${names[2]}\0`;
  });
  assert.deepEqual(new Set(changes.map((entry) => entry.file)), new Set(names));
  assert.ok(calls.every((args) => args.includes('-z')));
  assert.deepEqual(parseNameStatus(`M\0${names[2]}\0`), [
    { status: 'M', file: names[2] },
  ]);
});

test('REV-6467-4: explicit option-like file arguments fail closed', () => {
  assert.throws(() => parseArgs(['--files', '--write']), /[Oo]ption-like/);
});

test('REV-6467-5: hook refuses tracked staged or unstaged edits before planning', () => {
  const head = 'a'.repeat(40);
  for (const status of [' M file.ts\0', 'M  file.ts\0']) {
    const logs = [];
    assert.equal(
      main(['--hook'], {
        stdin: `refs/heads/fix/x ${head} refs/heads/fix/x ${'0'.repeat(40)}\n`,
        env: { TUTURUUU_PRE_PUSH: '1' },
        execFile: fakeGit({
          'git config': '',
          'git rev-parse HEAD': head,
          'git status': status,
        }),
        log: (line) => logs.push(line),
      }),
      1
    );
    assert.match(logs.join('\n'), /tracked files are dirty/);
  }
});

test('root config dry-run prints the CI-only coverage warning', () => {
  const logs = [];
  assert.equal(
    main(['--dry-run', '--files', 'bun.lock'], {
      execFile: fakeGit({
        'git merge-base': 'base',
        'git branch --show-current': 'chore/gate',
      }),
      log: (line) => logs.push(line),
    }),
    0
  );
  assert.match(logs.join('\n'), /not covered; CI only.*bun\.lock/);
});

test('REV-6467-8: hook refuses untracked inputs in selected reverse dependents', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-hook-untracked-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [workspace, manifest] of [
    ['packages/shared', { name: 'shared' }],
    [
      'apps/consumer',
      { name: 'consumer', dependencies: { shared: 'workspace:*' } },
    ],
  ]) {
    fs.mkdirSync(path.join(root, workspace), { recursive: true });
    fs.writeFileSync(
      path.join(root, workspace, 'package.json'),
      JSON.stringify(manifest)
    );
  }
  const head = 'a'.repeat(40);
  for (const untracked of [
    'packages/shared/new.ts',
    'apps/consumer/new.d.ts',
    '',
  ]) {
    const logs = [];
    const queries = [];
    const baseGit = fakeGit({
      'git config': '',
      'git rev-parse HEAD': head,
      'git status': '',
      'git merge-base': 'base',
      'git diff --name-status': 'M\0packages/shared/src/a.ts\0',
      'git branch --show-current': 'chore/gate',
    });
    const result = main(['--hook', '--dry-run', '--no-ttr'], {
      root,
      stdin: `refs/heads/fix/x ${head} refs/heads/fix/x ${'0'.repeat(40)}\n`,
      env: { TUTURUUU_PRE_PUSH: '1' },
      execFile: (command, args) => {
        if (args[0] !== 'ls-files') return baseGit(command, args);
        queries.push(args);
        return untracked ? `${untracked}\0` : '';
      },
      log: (line) => logs.push(line),
      spawn: () => {
        throw new Error('untracked refusal/dry-run must not execute checks');
      },
    });
    assert.equal(result, untracked ? 1 : 0);
    assert.deepEqual(queries, [
      [
        'ls-files',
        '--others',
        '--exclude-standard',
        '-z',
        '--',
        'packages/shared',
        'apps/consumer',
      ],
    ]);
    if (untracked) assert.ok(logs.join('\n').includes(untracked));
  }
});

test('tsrs resolution is lazy, qualified-project-only and offline in hooks', (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'changed-tsrs-admission-')
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const workspace of ['apps/tasks', 'apps/unqualified']) {
    fs.mkdirSync(path.join(root, workspace), { recursive: true });
    fs.writeFileSync(
      path.join(root, workspace, 'package.json'),
      JSON.stringify({
        name: workspace,
        scripts: { 'type-check': 'tsc -p tsconfig.json' },
      })
    );
    fs.writeFileSync(path.join(root, workspace, 'tsconfig.json'), '{}');
  }
  const head = 'a'.repeat(40);
  const calls = [];
  const options = [];
  const deps = {
    root,
    env: { TUTURUUU_PRE_PUSH: '1' },
    stdin: `refs/heads/fix/x ${head} refs/heads/fix/x ${'0'.repeat(40)}\n`,
    log: () => {},
    execFile: fakeGit({
      'git merge-base': 'base',
      'git branch --show-current': 'chore/gate',
      'git config': '',
      'git rev-parse HEAD': head,
      'git status': '',
      'git ls-files': '',
    }),
    resolveTsrs: (value) => {
      options.push(value);
      return '/explicit/tsrs';
    },
    spawn: (command) => {
      calls.push(command);
      return { status: 0, stdout: '' };
    },
  };
  for (const args of [
    ['--files', 'apps/tasks/src/a.ts'],
    ['--checker', 'tsrs', '--files', 'apps/unqualified/src/a.ts'],
  ]) {
    assert.equal(main(['--no-ttr', '--only', 'type-check', ...args], deps), 0);
    assert.equal(options.length, 0);
    assert.equal(calls.length, 1);
    assert.ok(calls.pop().endsWith('/tsc'));
  }
  assert.equal(
    main(
      [
        '--hook',
        '--no-ttr',
        '--only',
        'type-check',
        '--checker',
        'tsrs',
        '--files',
        'apps/tasks/src/a.ts',
      ],
      deps
    ),
    0
  );
  assert.equal(options.length, 1);
  assert.equal(options[0].allowNetwork, false);
  assert.equal(calls[0], '/explicit/tsrs');
  assert.ok(calls[1].endsWith('/tsc'));
});

test('forced tsrs uses only tsc in an unqualified project', (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'changed-tsrs-unqualified-')
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'apps/unqualified'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'apps/unqualified/package.json'),
    JSON.stringify({ scripts: { 'type-check': 'tsc -p tsconfig.json' } })
  );
  fs.writeFileSync(path.join(root, 'apps/unqualified/tsconfig.json'), '{}');
  const calls = [];
  const result = runTypeCheck(
    { typeCheck: { workspace: 'apps/unqualified' } },
    {
      root,
      env: {},
      checker: 'tsrs',
      checkers: { tsc: ['tsc'], tsrs: ['tsrs'] },
      changedFiles: new Set(),
      missing: new Map(),
      spawn: (command) => {
        calls.push(command);
        return {
          status: command === 'tsc' ? 2 : 0,
          stdout:
            command === 'tsc'
              ? 'apps/unqualified/src/a.ts(1,1): error TS2322: real error.'
              : '',
        };
      },
    }
  );
  assert.deepEqual(calls, ['tsc']);
  assert.equal(result.status, 'fail');
  assert.match(result.output, /real error/);
});
