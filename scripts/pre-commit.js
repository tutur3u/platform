#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process');

const MOBILE_PATH_PREFIX = 'apps/mobile/';

function runGit(execFile, args) {
  return execFile('git', args, {
    encoding: 'utf8',
  });
}

function getCurrentBranch(execFile = execFileSync) {
  return runGit(execFile, ['branch', '--show-current']).trim();
}

function getStagedFiles(execFile = execFileSync) {
  const output = runGit(execFile, [
    'diff',
    '--cached',
    '--name-only',
    '--diff-filter=ACMRD',
  ]);

  return output
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
}

function touchesMobile(files) {
  return files.some(
    (file) => file === 'apps/mobile' || file.startsWith(MOBILE_PATH_PREFIX)
  );
}

function runCommand(command, args, spawnImpl = spawnSync) {
  const result = spawnImpl(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function runPreCommit({ execFile = execFileSync, spawn = spawnSync } = {}) {
  if (getCurrentBranch(execFile) !== 'main') {
    return 0;
  }

  const stagedFiles = getStagedFiles(execFile);
  const shouldRunMobileCheck = touchesMobile(stagedFiles);
  const commands = [['bun', ['check']]];

  if (shouldRunMobileCheck) {
    commands.push(['bun', ['check:mobile']]);
  }

  for (const [command, args] of commands) {
    const exitCode = runCommand(command, args, spawn);
    if (exitCode !== 0) {
      return exitCode;
    }
  }

  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runPreCommit();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Pre-commit hook failed.'
    );
    process.exitCode = 1;
  }
}

module.exports = {
  getCurrentBranch,
  getStagedFiles,
  runPreCommit,
  runCommand,
  touchesMobile,
};
