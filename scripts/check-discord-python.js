#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DISCORD_DIR = path.join(ROOT_DIR, 'apps', 'discord');
const IMPORT_CHECK_SOURCE =
  'import daily_report; import commands; import discord_client; import wol_reminder';

function getTopLevelPythonFiles(discordDir = DISCORD_DIR, fsImpl = fs) {
  return fsImpl
    .readdirSync(discordDir)
    .filter((fileName) => fileName.endsWith('.py'))
    .filter((fileName) =>
      fsImpl.statSync(path.join(discordDir, fileName)).isFile()
    )
    .sort();
}

function createDiscordPythonChecks(options = {}) {
  const pythonFiles =
    options.pythonFiles ??
    getTopLevelPythonFiles(options.discordDir, options.fsImpl);
  const checks = [
    {
      name: 'Install Discord Python dependencies',
      command: 'uv',
      args: ['sync', '--locked'],
    },
    {
      name: 'Run Discord Ruff linter',
      command: 'uv',
      args: ['run', 'ruff', 'check', '.'],
    },
    {
      name: 'Run Discord Ruff formatter check',
      command: 'uv',
      args: ['run', 'ruff', 'format', '--check', '.'],
    },
    {
      name: 'Run Discord mypy type checker',
      command: 'uv',
      args: ['run', 'mypy', '.', '--config-file', 'mypy.ini'],
    },
    {
      name: 'Run Discord pytest suite',
      command: 'uv',
      args: ['run', 'pytest'],
    },
  ];

  if (pythonFiles.length > 0) {
    checks.push({
      name: 'Check Discord Python syntax',
      command: 'uv',
      args: ['run', 'python', '-m', 'py_compile', ...pythonFiles],
    });
  }

  checks.push({
    name: 'Verify Discord Python imports',
    command: 'uv',
    args: ['run', 'python', '-c', IMPORT_CHECK_SOURCE],
  });

  return checks;
}

function runCommand(check, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  const cwd = options.cwd ?? DISCORD_DIR;

  console.log(`--- ${check.name} ---`);
  const result = spawn(check.command, check.args, {
    cwd,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function runDiscordPythonChecks(options = {}) {
  const checks = options.checks ?? createDiscordPythonChecks(options);

  for (const check of checks) {
    const exitCode = runCommand(check, options);
    if (exitCode !== 0) {
      return exitCode;
    }
  }

  console.log('Discord Python checks passed.');
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runDiscordPythonChecks();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Discord Python checks failed.'
    );
    process.exitCode = 1;
  }
}

module.exports = {
  createDiscordPythonChecks,
  getTopLevelPythonFiles,
  runCommand,
  runDiscordPythonChecks,
};
