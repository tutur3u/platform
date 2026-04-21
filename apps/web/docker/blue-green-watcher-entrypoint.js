#!/usr/bin/env bun

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const WORKSPACE_DIR =
  process.env.PLATFORM_HOST_WORKSPACE_DIR?.trim() || '/workspace';
const WATCH_ARGS_FILE =
  process.env.PLATFORM_BLUE_GREEN_WATCH_ARGS_FILE ??
  path.join(
    WORKSPACE_DIR,
    'tmp',
    'docker-web',
    'watch',
    'blue-green-auto-deploy.args.json'
  );
const RESTART_EXIT_CODE = 75;
const WATCHER_CONTAINER_ENV = 'PLATFORM_BLUE_GREEN_WATCHER_CONTAINER';
const WATCHER_SCRIPT_PATH = path.join(
  WORKSPACE_DIR,
  'scripts',
  'watch-blue-green-deploy.js'
);

function readArgs() {
  if (!fs.existsSync(WATCH_ARGS_FILE)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(WATCH_ARGS_FILE, 'utf8'));
    return Array.isArray(parsed) &&
      parsed.every((value) => typeof value === 'string')
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function runWatcherOnce(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('bun', [WATCHER_SCRIPT_PATH, ...args], {
      cwd: WORKSPACE_DIR,
      env: {
        ...process.env,
        [WATCHER_CONTAINER_ENV]: '1',
      },
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolve({
        code: code ?? (signal ? 1 : 0),
        signal: signal ?? null,
      });
    });
  });
}

async function main() {
  while (true) {
    const result = await runWatcherOnce(readArgs());

    if (result.code === RESTART_EXIT_CODE) {
      console.info('Watcher requested an in-container restart. Relaunching.');
      continue;
    }

    process.exit(result.code);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
