const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createChildEnv,
  getGitLocalEnvKeys,
  getCurrentBranch,
  getStagedFiles,
  runPreCommit,
  touchesMobile,
} = require('./pre-commit.js');

function createGitExecFile({ branch = 'main', stagedFiles = '' } = {}) {
  return (_command, args) => {
    if (args[0] === 'rev-parse') {
      return 'GIT_DIR\nGIT_WORK_TREE\n';
    }

    if (args[0] === 'branch') {
      return `${branch}\n`;
    }

    if (args[0] === 'diff') {
      return stagedFiles;
    }

    throw new Error(`Unexpected git args: ${args.join(' ')}`);
  };
}

test('getCurrentBranch trims git output', () => {
  assert.equal(
    getCurrentBranch(() => 'main\n'),
    'main'
  );
});

test('getStagedFiles trims blank lines from git output', () => {
  const files = getStagedFiles(
    () => 'apps/web/page.tsx\n\napps/mobile/lib/main.dart\n'
  );

  assert.deepEqual(files, ['apps/web/page.tsx', 'apps/mobile/lib/main.dart']);
});

test('touchesMobile returns true when a staged file is under apps/mobile', () => {
  assert.equal(touchesMobile(['apps/mobile/lib/main.dart']), true);
  assert.equal(touchesMobile(['apps/web/src/app/page.tsx']), false);
});

test('getGitLocalEnvKeys reads git local environment keys', () => {
  const keys = getGitLocalEnvKeys(() => 'GIT_DIR\nGIT_WORK_TREE\n');

  assert.deepEqual(keys, ['GIT_DIR', 'GIT_WORK_TREE']);
});

test('createChildEnv removes git local environment keys', () => {
  const env = createChildEnv(
    {
      GIT_DIR: '.git',
      GIT_WORK_TREE: '/tmp/worktree',
      PATH: '/usr/bin',
    },
    ['GIT_DIR', 'GIT_WORK_TREE']
  );

  assert.deepEqual(env, { PATH: '/usr/bin' });
});

test('runPreCommit removes git local environment keys from checks', () => {
  const envs = [];

  const exitCode = runPreCommit({
    execFile: createGitExecFile({
      stagedFiles: 'apps/web/src/app/page.tsx\n',
    }),
    spawn: (_command, _args, options) => {
      envs.push(options.env);
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(envs.length, 1);
  assert.equal(envs[0].GIT_DIR, undefined);
  assert.equal(envs[0].GIT_WORK_TREE, undefined);
});

test('runPreCommit checks only the staged files when mobile is untouched', () => {
  const commands = [];

  const exitCode = runPreCommit({
    execFile: createGitExecFile({
      stagedFiles: 'apps/web/src/app/page.tsx\nscripts/check.js\n',
    }),
    spawn: (command, args) => {
      commands.push([command, args]);
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, [
    [
      'bun',
      [
        'check:changed',
        '--files',
        'apps/web/src/app/page.tsx',
        'scripts/check.js',
      ],
    ],
  ]);
});

test('runPreCommit never runs whole-repository validation on main', () => {
  const commands = [];

  runPreCommit({
    execFile: createGitExecFile({
      stagedFiles: 'apps/mobile/lib/main.dart\napps/web/src/app/page.tsx\n',
    }),
    spawn: (command, args) => {
      commands.push([command, args]);
      return { status: 0 };
    },
  });

  for (const [, args] of commands) {
    assert.notEqual(args[0], 'validate');
    if (args[0] === 'check:changed') {
      // --files consumes the remaining argv; nothing may follow the paths.
      assert.equal(args[1], '--files');
      assert.ok(args.slice(2).every((arg) => !arg.startsWith('--')));
    }
  }
});

test('runPreCommit skips checks when nothing is staged on main', () => {
  const commands = [];

  const exitCode = runPreCommit({
    execFile: createGitExecFile({ stagedFiles: '\n' }),
    spawn: (command, args) => {
      commands.push([command, args]);
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, []);
});

test('runPreCommit runs mobile checks after the staged-file gate when mobile is touched', () => {
  const commands = [];

  const exitCode = runPreCommit({
    execFile: createGitExecFile({
      stagedFiles: 'apps/mobile/lib/main.dart\napps/web/src/app/page.tsx\n',
    }),
    spawn: (command, args) => {
      commands.push([command, args]);
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, [
    [
      'bun',
      [
        'check:changed',
        '--files',
        'apps/mobile/lib/main.dart',
        'apps/web/src/app/page.tsx',
      ],
    ],
    ['bun', ['check:mobile']],
  ]);
});

test('runPreCommit stops on the first failing command', () => {
  const commands = [];

  const exitCode = runPreCommit({
    execFile: createGitExecFile({
      stagedFiles: 'apps/mobile/lib/main.dart\n',
    }),
    spawn: (command, args) => {
      commands.push([command, args]);
      return { status: 1 };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(commands, [
    ['bun', ['check:changed', '--files', 'apps/mobile/lib/main.dart']],
  ]);
});

test('runPreCommit skips checks outside the main branch', () => {
  const commands = [];

  const exitCode = runPreCommit({
    execFile: createGitExecFile({
      branch: 'codex/feature',
      stagedFiles: 'apps/mobile/lib/main.dart\n',
    }),
    spawn: (command, args) => {
      commands.push([command, args]);
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, []);
});
