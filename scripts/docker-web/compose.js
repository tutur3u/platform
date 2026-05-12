const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const COMPOSE_FILE = path.join(ROOT_DIR, 'docker-compose.web.yml');
const PROD_COMPOSE_FILE = path.join(ROOT_DIR, 'docker-compose.web.prod.yml');
const BLUE_GREEN_HEALTH_POLL_MS = 2_000;
const BLUE_GREEN_HEALTH_TIMEOUT_MS = 180_000;
const DOCKER_NAME_CONFLICT_PATTERN =
  /container name\s+"\/?([^"]+)"\s+is already in use/giu;
const DEFAULT_COMMAND_KILL_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_CAPTURED_OUTPUT_BYTES = 512_000;

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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function getComposeProjectName(composeFile, env = {}) {
  if (
    typeof env.COMPOSE_PROJECT_NAME === 'string' &&
    env.COMPOSE_PROJECT_NAME.trim().length > 0
  ) {
    return env.COMPOSE_PROJECT_NAME.trim();
  }

  return path.basename(path.dirname(composeFile));
}

function getComposeServiceContainerName(serviceName, { composeFile, env }) {
  return `${getComposeProjectName(composeFile, env)}-${serviceName}-1`;
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

async function runComposeUpWithNameConflictRecovery({
  composeFile,
  composeGlobalArgs = [],
  env,
  fsImpl,
  runCommand: run,
  services = [],
  upArgs,
}) {
  const args = getComposeCommandArgs(composeFile, composeGlobalArgs, ...upArgs);
  const expectedContainerNames = new Set(
    services.map((serviceName) =>
      getComposeServiceContainerName(serviceName, { composeFile, env })
    )
  );
  const removedContainerNames = new Set();
  const maxAttempts = Math.max(1, services.length + 1);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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

      if (conflictNames.length === 0 || attempt === maxAttempts - 1) {
        throw error;
      }

      await runChecked('docker', ['rm', '-f', ...conflictNames], {
        env,
        fsImpl,
        runCommand: run,
      });

      for (const containerName of conflictNames) {
        removedContainerNames.add(containerName);
      }
    }
  }

  throw new Error('Unable to recover from Docker Compose name conflicts.');
}

async function getComposeServiceContainerId(
  serviceName,
  {
    composeFile,
    composeGlobalArgs = [],
    env,
    includeStopped = false,
    runCommand: run,
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

async function getContainerHealthStatus(containerId, { env, runCommand: run }) {
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
    }
  );

  return result.stdout.trim();
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
  const containerId = await getComposeServiceContainerId(serviceName, {
    composeFile,
    composeGlobalArgs,
    env,
    runCommand: run,
  });

  if (!containerId) {
    throw new Error(`Unable to resolve a container for ${serviceName}.`);
  }

  const deadline = Date.now() + timeoutMs;
  let lastStatus = 'unknown';

  while (Date.now() <= deadline) {
    lastStatus = await getContainerHealthStatus(containerId, {
      env,
      runCommand: run,
    });

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
  hasComposeProfile,
  hasComposeServiceContainer,
  isComposeServiceHealthy,
  removeComposeServicesIfPresent,
  runComposeUpWithNameConflictRecovery,
  runChecked,
  runCommand,
  stopComposeServicesIfPresent,
  waitForComposeServiceHealthy,
};
