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

test('runPreCommit runs bun check only when mobile is untouched', () => {
  const commands = [];

  const exitCode = runPreCommit({
    execFile: createGitExecFile({
      stagedFiles: 'apps/web/src/app/page.tsx\n',
    }),
    spawn: (command, args) => {
      commands.push([command, args]);
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, [['bun', ['check']]]);
});

test('runPreCommit runs mobile checks after bun check when mobile is touched', () => {
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
    ['bun', ['check']],
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
  assert.deepEqual(commands, [['bun', ['check']]]);
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
