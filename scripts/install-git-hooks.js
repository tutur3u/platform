#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const path = require('node:path');

function getHooksPath(repoRoot) {
  return (
    path.relative(repoRoot, path.join(repoRoot, '.githooks')) || '.githooks'
  );
}

function installGitHooks(execFile = execFileSync) {
  let repoRoot;

  try {
    repoRoot = execFile('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return false;
  }

  const hooksPath = getHooksPath(repoRoot);

  execFile('git', ['config', 'core.hooksPath', hooksPath], {
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
