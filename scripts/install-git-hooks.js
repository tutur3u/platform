#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function getHooksPath(repoRoot) {
  return (
    path.relative(repoRoot, path.join(repoRoot, '.githooks')) || '.githooks'
  );
}

// `ttr git guard install` records its managed hooks directory here. When it
// exists, keep this clone on the guard (which chains to .githooks) instead of
// silently bypassing it with a local core.hooksPath.
function getGuardHooksPath(execFile, exists) {
  try {
    const value = execFile(
      'git',
      ['config', '--global', '--get', 'ttr-guard.hooksPath'],
      { encoding: 'utf8' }
    ).trim();
    return value && exists(path.join(value, 'pre-push')) ? value : null;
  } catch {
    return null;
  }
}

function installGitHooks(execFile = execFileSync, exists = fs.existsSync) {
  let repoRoot;

  try {
    repoRoot = execFile('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return false;
  }

  const hooksPath = getHooksPath(repoRoot);
  const guardHooksPath = getGuardHooksPath(execFile, exists);

  if (guardHooksPath) {
    execFile('git', ['config', 'ttr-guard.chainHooksPath', hooksPath], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  }

  execFile('git', ['config', 'core.hooksPath', guardHooksPath || hooksPath], {
    cwd: repoRoot,
    stdio: 'ignore',
  });

  return true;
}

if (require.main === module) {
  try {
    installGitHooks();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Failed to install git hooks.'
    );
    process.exitCode = 1;
  }
}

module.exports = {
  getHooksPath,
  installGitHooks,
};
