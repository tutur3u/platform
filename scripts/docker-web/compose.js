const path = require('node:path');
const { spawn } = require('node:child_process');

const { isTransientDockerRegistryError } = require('./registry-errors.js');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const COMPOSE_FILE = path.join(ROOT_DIR, 'docker-compose.web.yml');
const PROD_COMPOSE_FILE = path.join(ROOT_DIR, 'docker-compose.web.prod.yml');
const BLUE_GREEN_HEALTH_POLL_MS = 2_000;
const BLUE_GREEN_HEALTH_TIMEOUT_MS = 180_000;
const DOCKER_NAME_CONFLICT_PATTERN =
  /container name\s+"\/?([^"]+)"\s+is already in use/giu;
const DEFAULT_COMMAND_KILL_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_CAPTURED_OUTPUT_BYTES = 512_000;
const DEFAULT_COMPOSE_UP_RETRY_MAX_ATTEMPTS = 4;
const DEFAULT_COMPOSE_UP_RETRY_INITIAL_DELAY_MS = 5_000;
const DEFAULT_COMPOSE_UP_RETRY_MAX_DELAY_MS = 60_000;
const DOCKER_NO_SUCH_CONTAINER_PATTERN =
  /(?:no such (?:object|container)|no such container)/iu;
const COMPOSE_MISSING_DEPENDENCY_CONTAINER_PATTERN =
  /\bNo such container:\s*[0-9a-f]{12,64}\b/iu;
const COMPOSE_DEPENDENCY_FAILED_PATTERN = /dependency .*failed to start/iu;

class CommandTimeoutError extends Error {
  constructor(command, args, timeoutMs) {
    super(
      `Command timed out after ${timeoutMs}ms: ${[command, ...args].join(' ')}`
    );
    this.name = 'CommandTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

function getComposeFile(mode = 'dev') {
  return mode === 'prod' ? PROD_COMPOSE_FILE : COMPOSE_FILE;
}

function hasComposeProfile(composeGlobalArgs, profileName) {
  for (let index = 0; index < composeGlobalArgs.length; index += 1) {
    if (
      composeGlobalArgs[index] === '--profile' &&
      composeGlobalArgs[index + 1] === profileName
    ) {
      return true;
    }
  }

  return false;
}

function getComposeCommandArgs(composeFile, composeGlobalArgs, ...args) {
  return ['compose', '-f', composeFile, ...composeGlobalArgs, ...args];
}

function getComposeProjectNameFromGlobalArgs(composeGlobalArgs = []) {
  for (let index = 0; index < composeGlobalArgs.length; index += 1) {
    const arg = composeGlobalArgs[index];

    if (arg === '-p' || arg === '--project-name') {
      const value = composeGlobalArgs[index + 1];

      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    if (typeof arg === 'string' && arg.startsWith('--project-name=')) {
      const value = arg.slice('--project-name='.length).trim();

      if (value.length > 0) {
        return value;
      }
    }
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getPositiveIntegerEnv(env, name, fallback) {
  const value = env?.[name];

  if (typeof value !== 'string' && typeof value !== 'number') {
    return fallback;
  }

  const parsed = Number(String(value).trim());

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = (options.spawnImpl ?? spawn)(command, args, {
      cwd: options.cwd ?? ROOT_DIR,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timeout = null;
    let killTimeout = null;

    const clearTimers = () => {
      if (timeout) {
        clearTimeout(timeout);
      }

      if (killTimeout) {
        clearTimeout(killTimeout);
      }
    };
    const appendCapturedOutput = (current, chunk) => {
      const next = `${current}${chunk}`;
      const maxBytes =
        options.maxCapturedOutputBytes ?? DEFAULT_MAX_CAPTURED_OUTPUT_BYTES;

      if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
        return next;
      }

      if (Buffer.byteLength(next, 'utf8') <= maxBytes) {
        return next;
      }

      return next.slice(-maxBytes);
    };

    child.stdout?.on('data', (chunk) => {
      stdout = appendCapturedOutput(stdout, chunk);
      if (options.teeOutput) {
        (options.stdout ?? process.stdout).write(chunk);
      }
    });

    child.stderr?.on('data', (chunk) => {
      stderr = appendCapturedOutput(stderr, chunk);
      if (options.teeOutput) {
        (options.stderr ?? process.stderr).write(chunk);
      }
    });

    if (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        timedOut = true;
        child.kill(options.timeoutSignal ?? 'SIGTERM');
        killTimeout = setTimeout(() => {
          child.kill('SIGKILL');
        }, options.killTimeoutMs ?? DEFAULT_COMMAND_KILL_TIMEOUT_MS);
      }, options.timeoutMs);
    }

    child.on('error', (error) => {
      clearTimers();
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimers();
      resolve({
        code: code ?? 1,
        signal: signal ?? null,
        stderr,
        timedOut,
        stdout,
      });
    });
  });
}

async function runChecked(command, args, options = {}) {
  let result;

  try {
    result = await (options.runCommand ?? runCommand)(command, args, options);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw new Error(`Missing required executable: ${command}`);
    }

    throw error;
  }

  if (result.code !== 0) {
    const failedCommand = [command, ...args].join(' ');
    const detail = result.stderr?.trim() || result.stdout?.trim();

    if (result.timedOut) {
      const wrappedError = new CommandTimeoutError(
        command,
        args,
        options.timeoutMs
      );
      wrappedError.exitCode = result.code;
      wrappedError.signal = result.signal;
      wrappedError.stderr = result.stderr;
      wrappedError.stdout = result.stdout;
      throw wrappedError;
    }

    const wrappedError = new Error(
      detail
        ? `Command failed (${result.code}): ${failedCommand}\n${detail}`
        : `Command failed (${result.code}): ${failedCommand}`
    );
    wrappedError.exitCode = result.code;
    throw wrappedError;
  }

  return result;
}

function getComposeProjectName(composeFile, env = {}, composeGlobalArgs = []) {
  const projectNameFromGlobalArgs =
    getComposeProjectNameFromGlobalArgs(composeGlobalArgs);

  if (projectNameFromGlobalArgs) {
    return projectNameFromGlobalArgs;
  }

  if (
    typeof env.COMPOSE_PROJECT_NAME === 'string' &&
    env.COMPOSE_PROJECT_NAME.trim().length > 0
  ) {
    return env.COMPOSE_PROJECT_NAME.trim();
  }

  if (
    typeof env.DOCKER_WEB_COMPOSE_PROJECT_NAME === 'string' &&
    env.DOCKER_WEB_COMPOSE_PROJECT_NAME.trim().length > 0
  ) {
    return env.DOCKER_WEB_COMPOSE_PROJECT_NAME.trim();
  }

  return path.basename(path.dirname(composeFile));
}

function getComposeServiceContainerName(
  serviceName,
  { composeFile, composeGlobalArgs = [], env }
) {
  return `${getComposeProjectName(composeFile, env, composeGlobalArgs)}-${serviceName}-1`;
}

function isExpectedComposeContainerName(containerName, expectedContainerNames) {
  if (expectedContainerNames.has(containerName)) {
    return true;
  }

  for (const expectedContainerName of expectedContainerNames) {
    if (
      new RegExp(
        `^[0-9a-f]{12,64}_${escapeRegExp(expectedContainerName)}$`,
        'iu'
      ).test(containerName)
    ) {
      return true;
    }
  }

  return false;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function parseDockerContainerNameConflicts(error) {
  const message = error instanceof Error ? error.message : String(error);
  const conflicts = [];

  for (const match of message.matchAll(DOCKER_NAME_CONFLICT_PATTERN)) {
    if (match[1]) {
      conflicts.push(match[1].replace(/^\/+/u, ''));
    }
  }

  return conflicts;
}

function isComposeMissingContainerDependencyError(error) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    COMPOSE_MISSING_DEPENDENCY_CONTAINER_PATTERN.test(message) &&
    COMPOSE_DEPENDENCY_FAILED_PATTERN.test(message)
  );
}

async function runComposeUpWithNameConflictRecovery({
  composeFile,
  composeGlobalArgs = [],
  env,
  fsImpl,
  runCommand: run,
  services = [],
  sleep: sleepImpl = sleep,
  upArgs,
}) {
  const args = getComposeCommandArgs(composeFile, composeGlobalArgs, ...upArgs);
  const expectedContainerNames = new Set(
    services.map((serviceName) =>
      getComposeServiceContainerName(serviceName, {
        composeFile,
        composeGlobalArgs,
        env,
      })
    )
  );
  const removedContainerNames = new Set();
  const maxNameConflictRecoveries = services.length;
  const maxRegistryAttempts = getPositiveIntegerEnv(
    env,
    'DOCKER_WEB_COMPOSE_UP_RETRY_MAX_ATTEMPTS',
    DEFAULT_COMPOSE_UP_RETRY_MAX_ATTEMPTS
  );
  const maxRegistryDelayMs = getPositiveIntegerEnv(
    env,
    'DOCKER_WEB_COMPOSE_UP_RETRY_MAX_DELAY_MS',
    DEFAULT_COMPOSE_UP_RETRY_MAX_DELAY_MS
  );
  let registryAttempt = 1;
  let registryDelayMs = getPositiveIntegerEnv(
    env,
    'DOCKER_WEB_COMPOSE_UP_RETRY_INITIAL_DELAY_MS',
    DEFAULT_COMPOSE_UP_RETRY_INITIAL_DELAY_MS
  );
  let staleDependencyAttempt = 1;
  let staleDependencyDelayMs = registryDelayMs;
  let nameConflictRecoveries = 0;

  while (true) {
    try {
      return await runChecked('docker', args, {
        env,
        fsImpl,
        runCommand: run,
      });
    } catch (error) {
      const conflictNames = parseDockerContainerNameConflicts(error).filter(
        (containerName) =>
          isExpectedComposeContainerName(
            containerName,
            expectedContainerNames
          ) && !removedContainerNames.has(containerName)
      );

      if (
        conflictNames.length > 0 &&
        nameConflictRecoveries < maxNameConflictRecoveries
      ) {
        await runChecked('docker', ['rm', '-f', ...conflictNames], {
          env,
          fsImpl,
          runCommand: run,
        });

        for (const containerName of conflictNames) {
          removedContainerNames.add(containerName);
        }

        nameConflictRecoveries += 1;
        continue;
      }

      if (
        registryAttempt < maxRegistryAttempts &&
        isTransientDockerRegistryError(error)
      ) {
        process.stderr.write(
          `Docker Compose up hit a transient Docker registry error; retrying in ${registryDelayMs}ms (attempt ${
            registryAttempt + 1
          }/${maxRegistryAttempts}).\n`
        );
        await sleepImpl(registryDelayMs);
        registryAttempt += 1;
        registryDelayMs = Math.min(registryDelayMs * 2, maxRegistryDelayMs);
        continue;
      }

      if (
        staleDependencyAttempt < maxRegistryAttempts &&
        isComposeMissingContainerDependencyError(error)
      ) {
        process.stderr.write(
          `Docker Compose up hit a stale dependency container reference; retrying in ${staleDependencyDelayMs}ms (attempt ${
            staleDependencyAttempt + 1
          }/${maxRegistryAttempts}).\n`
        );
        await sleepImpl(staleDependencyDelayMs);
        staleDependencyAttempt += 1;
        staleDependencyDelayMs = Math.min(
          staleDependencyDelayMs * 2,
          maxRegistryDelayMs
        );
        continue;
      }

      throw error;
    }
  }
}

async function getComposeServiceContainerId(
  serviceName,
  {
    composeFile,
    composeGlobalArgs = [],
    env,
    includeStopped = false,
    runCommand: run,
    timeoutMs,
  }
) {
  const result = await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'ps',
      ...(includeStopped ? ['-a'] : []),
      '-q',
      serviceName
    ),
    {
      env,
      runCommand: run,
      stdio: 'pipe',
      timeoutMs,
    }
  );

  return result.stdout.trim();
}

async function hasComposeServiceContainer(
  serviceName,
  {
    composeFile,
    composeGlobalArgs = [],
    env,
    includeStopped = false,
    runCommand: run,
  }
) {
  const containerId = await getComposeServiceContainerId(serviceName, {
    composeFile,
    composeGlobalArgs,
    env,
    includeStopped,
    runCommand: run,
  });

  return containerId.length > 0;
}

async function listComposeServiceContainerIdsByLabel(
  serviceName,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  const result = await runChecked(
    'docker',
    [
      'ps',
      '-aq',
      '--filter',
      `label=com.docker.compose.project=${getComposeProjectName(
        composeFile,
        env,
        composeGlobalArgs
      )}`,
      '--filter',
      `label=com.docker.compose.service=${serviceName}`,
      '--format',
      '{{.ID}}',
    ],
    {
      env,
      runCommand: run,
      stdio: 'pipe',
    }
  );

  return result.stdout
    .split(/\s+/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function removeComposeServiceContainersByLabelIfPresent(
  serviceNames,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  for (const serviceName of serviceNames) {
    const containerIds = await listComposeServiceContainerIdsByLabel(
      serviceName,
      {
        composeFile,
        composeGlobalArgs,
        env,
        runCommand: run,
      }
    );

    if (containerIds.length === 0) {
      continue;
    }

    await runChecked('docker', ['rm', '-f', ...containerIds], {
      env,
      runCommand: run,
    });
  }
}

async function isComposeServiceHealthy(
  serviceName,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  const containerId = await getComposeServiceContainerId(serviceName, {
    composeFile,
    composeGlobalArgs,
    env,
    runCommand: run,
  });

  if (!containerId) {
    return false;
  }

  try {
    return (
      (await getContainerHealthStatus(containerId, {
        env,
        runCommand: run,
      })) === 'healthy'
    );
  } catch {
    return false;
  }
}

async function stopComposeServicesIfPresent(
  serviceNames,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  for (const serviceName of serviceNames) {
    if (
      !(await hasComposeServiceContainer(serviceName, {
        composeFile,
        composeGlobalArgs,
        env,
        runCommand: run,
      }))
    ) {
      continue;
    }

    await runChecked(
      'docker',
      getComposeCommandArgs(
        composeFile,
        composeGlobalArgs,
        'stop',
        serviceName
      ),
      {
        env,
        runCommand: run,
      }
    );
  }
}

async function removeComposeServicesIfPresent(
  serviceNames,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  for (const serviceName of serviceNames) {
    if (
      !(await hasComposeServiceContainer(serviceName, {
        composeFile,
        composeGlobalArgs,
        env,
        includeStopped: true,
        runCommand: run,
      }))
    ) {
      continue;
    }

    await runChecked(
      'docker',
      getComposeCommandArgs(
        composeFile,
        composeGlobalArgs,
        'rm',
        '-f',
        serviceName
      ),
      {
        env,
        runCommand: run,
      }
    );
  }
}

async function getContainerHealthStatus(
  containerId,
  { env, runCommand: run, timeoutMs }
) {
  const result = await runChecked(
    'docker',
    [
      'inspect',
      '-f',
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
      containerId,
    ],
    {
      env,
      runCommand: run,
      stdio: 'pipe',
      timeoutMs,
    }
  );

  return result.stdout.trim();
}

function isDockerNoSuchContainerError(error) {
  const message = error instanceof Error ? error.message : String(error);

  return DOCKER_NO_SUCH_CONTAINER_PATTERN.test(message);
}

async function waitForComposeServiceHealthy(
  serviceName,
  {
    composeFile,
    composeGlobalArgs = [],
    env,
    pollMs = BLUE_GREEN_HEALTH_POLL_MS,
    runCommand: run,
    timeoutMs = BLUE_GREEN_HEALTH_TIMEOUT_MS,
  }
) {
  const deadline = Date.now() + timeoutMs;
  let containerId = '';
  let lastStatus = 'unknown';

  while (Date.now() <= deadline) {
    if (!containerId) {
      containerId = await getComposeServiceContainerId(serviceName, {
        composeFile,
        composeGlobalArgs,
        env,
        runCommand: run,
      });
    }

    if (!containerId) {
      lastStatus = 'missing';
      await sleep(pollMs);
      continue;
    }

    try {
      lastStatus = await getContainerHealthStatus(containerId, {
        env,
        runCommand: run,
      });
    } catch (error) {
      if (!isDockerNoSuchContainerError(error)) {
        throw error;
      }

      containerId = '';
      lastStatus = 'missing';
      await sleep(pollMs);
      continue;
    }

    if (lastStatus === 'healthy') {
      return;
    }

    if (lastStatus === 'dead' || lastStatus === 'exited') {
      throw new Error(
        `${serviceName} failed before becoming healthy (status: ${lastStatus}).`
      );
    }

    await sleep(pollMs);
  }

  throw new Error(
    `${serviceName} did not become healthy within ${timeoutMs}ms (last status: ${lastStatus}).`
  );
}

module.exports = {
  COMPOSE_FILE,
  CommandTimeoutError,
  PROD_COMPOSE_FILE,
  getComposeCommandArgs,
  getComposeFile,
  getComposeServiceContainerId,
  getContainerHealthStatus,
  getComposeServiceContainerName,
  getPositiveIntegerEnv,
  hasComposeProfile,
  hasComposeServiceContainer,
  isComposeMissingContainerDependencyError,
  isComposeServiceHealthy,
  isDockerNoSuchContainerError,
  listComposeServiceContainerIdsByLabel,
  removeComposeServiceContainersByLabelIfPresent,
  removeComposeServicesIfPresent,
  runComposeUpWithNameConflictRecovery,
  runChecked,
  runCommand,
  sleep,
  stopComposeServicesIfPresent,
  waitForComposeServiceHealthy,
};
