#!/usr/bin/env bun

const fs = require('node:fs');
const { spawn } = require('node:child_process');

const WATCH_ARGS_FILE =
  process.env.PLATFORM_BLUE_GREEN_WATCH_ARGS_FILE ??
  '/workspace/tmp/docker-web/watch/blue-green-auto-deploy.args.json';
const RESTART_EXIT_CODE = 75;
const WATCHER_CONTAINER_ENV = 'PLATFORM_BLUE_GREEN_WATCHER_CONTAINER';

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
    const child = spawn(
      'bun',
      ['scripts/watch-blue-green-deploy.js', ...args],
      {
        cwd: '/workspace',
        env: {
          ...process.env,
          [WATCHER_CONTAINER_ENV]: '1',
        },
        stdio: 'inherit',
      }
    );

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
