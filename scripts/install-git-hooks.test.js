const test = require('node:test');
const assert = require('node:assert/strict');

const { getHooksPath, installGitHooks } = require('./install-git-hooks.js');

test('getHooksPath resolves the repo-managed hooks directory', () => {
  assert.equal(getHooksPath('/repo'), '.githooks');
});

test('installGitHooks configures core.hooksPath for the git repo root', () => {
  const calls = [];
  const execFile = (command, args, options = {}) => {
    calls.push({ command, args, options });

    if (args[0] === 'rev-parse') {
      return '/repo\n';
    }

    return '';
  };

  assert.equal(installGitHooks(execFile), true);
  assert.deepEqual(calls, [
    {
      command: 'git',
      args: ['rev-parse', '--show-toplevel'],
      options: { encoding: 'utf8' },
    },
    {
      command: 'git',
      args: ['config', 'core.hooksPath', '.githooks'],
      options: { cwd: '/repo', stdio: 'ignore' },
    },
  ]);
});

test('installGitHooks is a no-op outside a git repository', () => {
  const execFile = () => {
    throw new Error('not a git repo');
  };

  assert.equal(installGitHooks(execFile), false);
});
