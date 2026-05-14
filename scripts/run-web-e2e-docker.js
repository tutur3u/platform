#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseArgs: parseDockerWebArgs,
  runDockerWebWorkflow,
} = require('./docker-web.js');
const {
  assertSafeE2EEnvironment,
  createLocalE2EEnvFileContent,
  createLocalE2EProcessEnv,
} = require('./e2e-local-environment.js');
const { SKIP_WATCH_HISTORY_ENV } = require('./watch-blue-green/history.js');
const { WATCHER_CONTAINER_ENV } = require('./watch-blue-green-deploy.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT_DIR, 'apps', 'web');
const DEFAULT_ENV_FILE = path.join(ROOT_DIR, 'tmp', 'e2e', 'web.env');
const DEFAULT_HEALTH_URL = 'http://localhost:7803/login';

function getDockerWebUpArgs(envFilePath) {
  return [
    'up',
    '--mode',
    'prod',
    '--strategy',
    'blue-green',
    '--reset-supabase',
    '--build-memory',
    process.env.E2E_DOCKER_BUILD_MEMORY ?? '12g',
    '--build-cpus',
    process.env.E2E_DOCKER_BUILD_CPUS ?? '4',
    '--build-max-parallelism',
    process.env.E2E_DOCKER_BUILD_MAX_PARALLELISM ?? '1',
    '--env-file',
    envFilePath,
  ];
}

function getDockerWebDownArgs(envFilePath) {
  return [
    'down',
    '--mode',
    'prod',
    '--strategy',
    'blue-green',
    '--env-file',
    envFilePath,
  ];
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? ROOT_DIR,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} exited with ${signal ?? code ?? 'error'}`
        )
      );
    });
  });
}

async function waitForUrl(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });

      if (response.status >= 200 && response.status < 400) {
        return;
      }

      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timed out waiting for ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

function ensureLocalE2EEnvFile(envFilePath) {
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(envFilePath, createLocalE2EEnvFileContent(), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function shouldKeepStack(env = process.env) {
  return /^(1|true|yes)$/iu.test(String(env.E2E_KEEP_DOCKER_STACK ?? ''));
}

async function stopDockerizedE2E({ env, envFilePath }) {
  await runDockerWebWorkflow(
    parseDockerWebArgs(getDockerWebDownArgs(envFilePath)),
    {
      env,
      envFilePath,
      rootDir: ROOT_DIR,
    }
  );
  await runCommand('bun', ['sb:stop'], { env, cwd: ROOT_DIR });
}

async function runWebE2E(playwrightArgs = process.argv.slice(2), options = {}) {
  const envFilePath = options.envFilePath ?? DEFAULT_ENV_FILE;
  ensureLocalE2EEnvFile(envFilePath);

  const env = {
    ...createLocalE2EProcessEnv(process.env, {
      envFilePath,
      rootDir: ROOT_DIR,
    }),
    [SKIP_WATCH_HISTORY_ENV]: '1',
    [WATCHER_CONTAINER_ENV]: '1',
  };

  assertSafeE2EEnvironment(env);

  let stackTouched = false;
  let runError = null;

  try {
    stackTouched = true;
    await runDockerWebWorkflow(
      parseDockerWebArgs(getDockerWebUpArgs(envFilePath)),
      {
        env,
        envFilePath,
        rootDir: ROOT_DIR,
      }
    );
    await waitForUrl(DEFAULT_HEALTH_URL);
    await runCommand('bunx', ['playwright', 'test', ...playwrightArgs], {
      cwd: WEB_DIR,
      env,
    });
  } catch (error) {
    runError = error;
  }

  if (stackTouched && !shouldKeepStack(env)) {
    try {
      await stopDockerizedE2E({ env, envFilePath });
    } catch (cleanupError) {
      if (!runError) {
        runError = cleanupError;
      } else {
        console.error(
          cleanupError instanceof Error ? cleanupError.message : cleanupError
        );
      }
    }
  }

  if (runError) {
    throw runError;
  }
}

async function main() {
  try {
    await runWebE2E();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  DEFAULT_ENV_FILE,
  DEFAULT_HEALTH_URL,
  ensureLocalE2EEnvFile,
  getDockerWebDownArgs,
  getDockerWebUpArgs,
  runCommand,
  runWebE2E,
  shouldKeepStack,
  stopDockerizedE2E,
  waitForUrl,
};
