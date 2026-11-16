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
      args: ['config', '--global', '--get', 'ttr-guard.hooksPath'],
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

test('installGitHooks keeps a ttr git guard clone on the managed hooks', () => {
  const calls = [];
  const execFile = (_command, args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') return '/repo\n';
    if (args.includes('ttr-guard.hooksPath')) return '/home/me/guard/hooks\n';
    return '';
  };
  const exists = (file) => file === '/home/me/guard/hooks/pre-push';

  assert.equal(installGitHooks(execFile, exists), true);
  assert.deepEqual(calls.slice(2), [
    ['config', 'ttr-guard.chainHooksPath', '.githooks'],
    ['config', 'core.hooksPath', '/home/me/guard/hooks'],
  ]);
});

test('installGitHooks ignores a stale guard marker', () => {
  const calls = [];
  const execFile = (_command, args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') return '/repo\n';
    if (args.includes('ttr-guard.hooksPath')) return '/gone/hooks\n';
    return '';
  };

  installGitHooks(execFile, () => false);
  assert.deepEqual(calls.at(-1), ['config', 'core.hooksPath', '.githooks']);
});
