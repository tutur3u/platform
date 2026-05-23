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
const E2E_COMPOSE_PROJECT_PREFIX = 'ttr-e2e-';
const LOW_DOCKER_MEMORY_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;

function getDockerWebUpArgs(envFilePath, env = process.env) {
  return [
    'up',
    '--mode',
    'prod',
    '--strategy',
    'blue-green',
    '--reset-supabase',
    '--build-memory',
    env.E2E_DOCKER_BUILD_MEMORY ?? 'auto',
    '--build-cpus',
    env.E2E_DOCKER_BUILD_CPUS ?? 'auto',
    '--build-max-parallelism',
    env.E2E_DOCKER_BUILD_MAX_PARALLELISM ?? 'auto',
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
    '--volumes',
    '--rmi',
    'local',
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

function runCommandForOutput(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? ROOT_DIR,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve({ stderr, stdout });
        return;
      }

      const detail = stderr.trim() || stdout.trim();
      reject(
        new Error(
          detail
            ? `${command} ${args.join(' ')} exited with ${signal ?? code ?? 'error'}\n${detail}`
            : `${command} ${args.join(' ')} exited with ${signal ?? code ?? 'error'}`
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

function isE2EComposeProjectName(projectName) {
  return (
    typeof projectName === 'string' &&
    projectName.startsWith(E2E_COMPOSE_PROJECT_PREFIX)
  );
}

function getE2EComposeProjectName(env = process.env) {
  const projectName = env.DOCKER_WEB_COMPOSE_PROJECT_NAME;
  return isE2EComposeProjectName(projectName) ? projectName : null;
}

function parseE2EProjectImageTags(imageListOutput, projectName) {
  if (!isE2EComposeProjectName(projectName)) {
    return [];
  }

  const repositoryPrefix = `${projectName}-`;
  const tags = new Set();

  for (const line of imageListOutput.split(/\r?\n/u)) {
    const imageRef = line.trim();

    if (!imageRef || imageRef.includes('<none>')) {
      continue;
    }

    const tagSeparatorIndex = imageRef.lastIndexOf(':');

    if (tagSeparatorIndex <= 0) {
      continue;
    }

    const repository = imageRef.slice(0, tagSeparatorIndex);

    if (repository.startsWith(repositoryPrefix)) {
      tags.add(imageRef);
    }
  }

  return [...tags].sort();
}

async function getDockerMemoryLimit({
  env,
  runCommandForOutput: runForOutput = runCommandForOutput,
} = {}) {
  try {
    const result = await runForOutput(
      'docker',
      ['info', '--format', '{{json .MemTotal}}'],
      { env }
    );
    const parsed = Number.parseInt(result.stdout.trim(), 10);

    return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : null;
  } catch {
    return null;
  }
}

function applyLocalE2EBuildDefaults(env) {
  const dockerMemoryLimit = Number.parseInt(
    String(env.DOCKER_WEB_DOCKER_MEMORY_LIMIT ?? '').trim(),
    10
  );

  if (
    Number.isFinite(dockerMemoryLimit) &&
    dockerMemoryLimit > 0 &&
    dockerMemoryLimit < LOW_DOCKER_MEMORY_LIMIT_BYTES
  ) {
    const nextEnv = { ...env };

    if (!nextEnv.DOCKER_WEB_NEXT_BUILD_ENGINE) {
      nextEnv.DOCKER_WEB_NEXT_BUILD_ENGINE = 'webpack';
    }

    if (!nextEnv.DOCKER_WEB_WEBPACK_BUILD_WORKER) {
      nextEnv.DOCKER_WEB_WEBPACK_BUILD_WORKER = '0';
    }

    return nextEnv;
  }

  return env;
}

async function removeE2EProjectImages({
  env,
  projectName = getE2EComposeProjectName(env),
  runCommand: run = runCommand,
  runCommandForOutput: runForOutput = runCommandForOutput,
} = {}) {
  if (!isE2EComposeProjectName(projectName)) {
    return [];
  }

  const imageList = await runForOutput(
    'docker',
    ['image', 'ls', '--format', '{{.Repository}}:{{.Tag}}'],
    { env }
  );
  const imageTags = parseE2EProjectImageTags(imageList.stdout, projectName);

  if (imageTags.length === 0) {
    return [];
  }

  await run('docker', ['image', 'rm', ...imageTags], { env });
  return imageTags;
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
  await removeE2EProjectImages({ env });
  await runCommand('bun', ['sb:stop'], { env, cwd: ROOT_DIR });
}

async function runWebE2E(playwrightArgs = process.argv.slice(2), options = {}) {
  const envFilePath = options.envFilePath ?? DEFAULT_ENV_FILE;
  ensureLocalE2EEnvFile(envFilePath);

  let env = {
    ...createLocalE2EProcessEnv(process.env, {
      envFilePath,
      rootDir: ROOT_DIR,
    }),
    [SKIP_WATCH_HISTORY_ENV]: '1',
    [WATCHER_CONTAINER_ENV]: '1',
    DOCKER_WEB_BUILDKIT_PRUNE_AFTER_BUILD:
      process.env.E2E_DOCKER_BUILDKIT_PRUNE_AFTER_BUILD ?? '1',
  };
  const dockerMemoryLimit = await getDockerMemoryLimit({
    env,
    runCommandForOutput,
  });

  if (dockerMemoryLimit && !env.DOCKER_WEB_DOCKER_MEMORY_LIMIT) {
    env = {
      ...env,
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: dockerMemoryLimit,
    };
  }

  env = applyLocalE2EBuildDefaults(env);

  assertSafeE2EEnvironment(env);

  let stackTouched = false;
  let runError = null;

  try {
    stackTouched = true;
    await runDockerWebWorkflow(
      parseDockerWebArgs(getDockerWebUpArgs(envFilePath, env)),
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
  E2E_COMPOSE_PROJECT_PREFIX,
  applyLocalE2EBuildDefaults,
  ensureLocalE2EEnvFile,
  getDockerMemoryLimit,
  getE2EComposeProjectName,
  getDockerWebDownArgs,
  getDockerWebUpArgs,
  isE2EComposeProjectName,
  parseE2EProjectImageTags,
  removeE2EProjectImages,
  runCommand,
  runCommandForOutput,
  runWebE2E,
  shouldKeepStack,
  stopDockerizedE2E,
  waitForUrl,
};
