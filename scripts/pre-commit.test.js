const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCurrentBranch,
  getStagedFiles,
  runPreCommit,
  touchesMobile,
} = require('./pre-commit.js');

function createGitExecFile({ branch = 'main', stagedFiles = '' } = {}) {
  return (_command, args) => {
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
