const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const COMPOSE_FILE = path.join(ROOT_DIR, 'docker-compose.web.yml');
const PROD_COMPOSE_FILE = path.join(ROOT_DIR, 'docker-compose.web.prod.yml');
const BLUE_GREEN_HEALTH_POLL_MS = 2_000;
const BLUE_GREEN_HEALTH_TIMEOUT_MS = 180_000;

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

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({
        code: code ?? 1,
        signal: signal ?? null,
        stderr,
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

async function getComposeServiceContainerId(
  serviceName,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  const result = await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'ps',
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
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  const containerId = await getComposeServiceContainerId(serviceName, {
    composeFile,
    composeGlobalArgs,
    env,
    runCommand: run,
  });

  return containerId.length > 0;
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
  PROD_COMPOSE_FILE,
  getComposeCommandArgs,
  getComposeFile,
  getComposeServiceContainerId,
  getContainerHealthStatus,
  hasComposeProfile,
  hasComposeServiceContainer,
  removeComposeServicesIfPresent,
  runChecked,
  runCommand,
  stopComposeServicesIfPresent,
  waitForComposeServiceHealthy,
};
