#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const {
  parseArgs: parseDockerWebArgs,
  runDockerWebWorkflow,
} = require('./docker-web.js');
const { PROD_COMPOSE_FILE } = require('./docker-web/compose.js');
const {
  assertSafeE2EEnvironment,
  createLocalE2EEnvFileContent,
  createLocalE2EProcessEnv,
  LOCAL_E2E_BASE_URL,
  SAFE_LOCAL_WEB_ORIGINS,
} = require('./e2e-local-environment.js');
const { SKIP_WATCH_HISTORY_ENV } = require('./watch-blue-green/history.js');
const { WATCHER_CONTAINER_ENV } = require('./watch-blue-green-deploy.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT_DIR, 'apps', 'web');
const DEFAULT_ENV_FILE = path.join(ROOT_DIR, 'tmp', 'e2e', 'web.env');
const DEFAULT_HEALTH_URL = 'http://127.0.0.1:7803/login';
const DEFAULT_PORTLESS_BASE_URL = LOCAL_E2E_BASE_URL;
const DEFAULT_PORTLESS_HEALTH_URL = `${DEFAULT_PORTLESS_BASE_URL}/login`;
const DEFAULT_PORTLESS_READY_STATUS_CODES = Object.freeze([404]);
const DEFAULT_PORTLESS_READY_TIMEOUT_MS = 300_000;
const DEFAULT_DIAGNOSTIC_LOG_TAIL = '300';
const E2E_COMPOSE_PROJECT_PREFIX = 'ttr-e2e-';
const PORTLESS_ROUTE_NAME = 'tuturuuu';
const DEFAULT_WEB_PROXY_HOST_PORT = '7803';
const DNS_IPV4_FIRST_NODE_OPTION = '--dns-result-order=ipv4first';
const DEFAULT_PORTLESS_ALIAS_VERIFY_ATTEMPTS = 3;
const DEFAULT_PORTLESS_ALIAS_VERIFY_DELAY_MS = 1_000;
const E2E_DIAGNOSTIC_SERVICES = Object.freeze([
  'web-proxy',
  'web-blue',
  'web-green',
  'hive-blue',
  'hive-green',
  'hive-realtime',
  'meet-realtime',
  'backend',
  'markitdown',
  'storage-unzip-proxy',
  'web-cron-runner',
]);
const PORTLESS_NOT_READY_PATTERNS = Object.freeze([
  /No app registered/iu,
  /No apps running/iu,
]);

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

function getErrorMessage(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause =
    error.cause instanceof Error
      ? error.cause.message
      : error.cause == null
        ? ''
        : String(error.cause);

  return cause ? `${error.message}: ${cause}` : error.message;
}

function writeDiagnosticLine(output, message = '') {
  output.write(`${message}\n`);
}

function startDiagnosticGroup(title, { env = process.env, output } = {}) {
  if (env.GITHUB_ACTIONS) {
    writeDiagnosticLine(output, `::group::${title}`);
    return;
  }

  writeDiagnosticLine(output, `[e2e-diagnostics] ${title}`);
}

function endDiagnosticGroup({ env = process.env, output } = {}) {
  if (env.GITHUB_ACTIONS) {
    writeDiagnosticLine(output, '::endgroup::');
  }
}

function getE2EDiagnosticLogTail(env = process.env) {
  const value = String(env.E2E_DIAGNOSTIC_LOG_TAIL ?? '').trim();

  return /^\d+$/u.test(value) && Number.parseInt(value, 10) > 0
    ? value
    : DEFAULT_DIAGNOSTIC_LOG_TAIL;
}

function getDiagnosticCommandEnv(env = process.env) {
  const projectName = getE2EComposeProjectName(env);

  return projectName
    ? {
        ...env,
        COMPOSE_PROJECT_NAME: projectName,
      }
    : env;
}

function getDockerComposeDiagnosticArgs(env = process.env, ...args) {
  const projectName = getE2EComposeProjectName(env);
  const envFilePath = env.DOCKER_WEB_ENV_FILE;

  return [
    'compose',
    ...(envFilePath ? ['--env-file', envFilePath] : []),
    '-f',
    PROD_COMPOSE_FILE,
    ...(projectName ? ['-p', projectName] : []),
    ...args,
  ];
}

function getPortlessHealthUrl(env = process.env) {
  const baseUrl = env.BASE_URL ?? DEFAULT_PORTLESS_BASE_URL;

  try {
    const url = new URL(baseUrl);
    url.pathname = '/login';
    url.search = '';
    url.hash = '';

    return url.toString();
  } catch {
    return DEFAULT_PORTLESS_HEALTH_URL;
  }
}

function getWebProxyHostPort(env = process.env) {
  const value = String(
    env.DOCKER_WEB_PROXY_HOST_PORT ?? DEFAULT_WEB_PROXY_HOST_PORT
  ).trim();

  return /^\d+$/u.test(value) && Number.parseInt(value, 10) > 0
    ? value
    : DEFAULT_WEB_PROXY_HOST_PORT;
}

function getWebProxyHealthUrl(env = process.env) {
  const value =
    typeof env.E2E_WEB_PROXY_HEALTH_URL === 'string'
      ? env.E2E_WEB_PROXY_HEALTH_URL.trim()
      : '';

  if (value) {
    return value;
  }

  return `http://127.0.0.1:${getWebProxyHostPort(env)}/login`;
}

function getPortlessProxyStartArgs(env = process.env) {
  const args = ['portless', 'proxy', 'start', '--wildcard'];
  const port = String(env.PORTLESS_PORT ?? '').trim();

  if (/^\d+$/u.test(port) && Number.parseInt(port, 10) > 0) {
    args.push('--port', port, '--https');
  }

  return args;
}

function getPortlessCommandEnv(env = process.env) {
  const nodeOptions = String(env.NODE_OPTIONS ?? '').trim();
  const options = nodeOptions ? nodeOptions.split(/\s+/u) : [];

  if (options.includes(DNS_IPV4_FIRST_NODE_OPTION)) {
    return env;
  }

  return {
    ...env,
    NODE_OPTIONS: [...options, DNS_IPV4_FIRST_NODE_OPTION].join(' '),
  };
}

function isPortlessNotReadyBody(body) {
  return PORTLESS_NOT_READY_PATTERNS.some((pattern) =>
    pattern.test(String(body ?? ''))
  );
}

function getPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getPortlessAliasVerifyAttempts(env = process.env) {
  return getPositiveInteger(
    env.PORTLESS_ALIAS_VERIFY_ATTEMPTS,
    DEFAULT_PORTLESS_ALIAS_VERIFY_ATTEMPTS
  );
}

function getPortlessAliasVerifyDelayMs(env = process.env) {
  return getPositiveInteger(
    env.PORTLESS_ALIAS_VERIFY_DELAY_MS,
    DEFAULT_PORTLESS_ALIAS_VERIFY_DELAY_MS
  );
}

function routeListHasPortlessAlias(routeListOutput, env = process.env) {
  const output = String(routeListOutput ?? '');
  const hostPort = getWebProxyHostPort(env);
  const aliasPatterns = [
    new RegExp(`\\b${PORTLESS_ROUTE_NAME}\\.localhost\\b`, 'iu'),
    new RegExp(`\\b${PORTLESS_ROUTE_NAME}\\b`, 'iu'),
  ];
  const hostPortPattern = new RegExp(
    `(?:localhost|127\\.0\\.0\\.1):?${hostPort}\\b`,
    'iu'
  );

  return (
    aliasPatterns.some((pattern) => pattern.test(output)) &&
    hostPortPattern.test(output)
  );
}

function getResponseBodySnippet(body) {
  return String(body ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 240);
}

function isLocalHttpsReadinessUrl(url) {
  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === 'https:' && SAFE_LOCAL_WEB_ORIGINS.has(parsed.origin)
    );
  } catch {
    return false;
  }
}

function getReadinessFetchOptions(url, options = {}) {
  const fetchOptions = {
    redirect: 'manual',
  };

  if (Number.isFinite(options.requestTimeoutMs)) {
    fetchOptions.requestTimeoutMs = options.requestTimeoutMs;
  }

  if (isLocalHttpsReadinessUrl(url)) {
    fetchOptions.rejectUnauthorized = false;
  }

  return fetchOptions;
}

function fetchLocalHttpsReadinessUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        headers: {
          accept: '*/*',
        },
        method: 'GET',
        rejectUnauthorized: false,
      },
      (response) => {
        let body = '';

        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            text: async () => body,
          });
        });
      }
    );

    request.setTimeout(options.requestTimeoutMs ?? 10_000, () => {
      request.destroy(new Error(`Timed out requesting ${url}`));
    });
    request.on('error', reject);
    request.end();
  });
}

function fetchReadinessUrl(url, options = {}) {
  const { rejectUnauthorized, requestTimeoutMs, ...fetchOptions } = options;

  if (rejectUnauthorized === false) {
    return fetchLocalHttpsReadinessUrl(url, { requestTimeoutMs });
  }

  return fetch(url, fetchOptions);
}

function formatBlueGreenStages(stages) {
  if (!Array.isArray(stages) || stages.length === 0) {
    return [];
  }

  return stages.map((stage) => {
    const parts = [
      stage.id ?? 'unknown-stage',
      stage.status ?? 'unknown-status',
    ];

    if (stage.color) {
      parts.push(`color=${stage.color}`);
    }

    if (Array.isArray(stage.buildServices) && stage.buildServices.length > 0) {
      parts.push(`build=${stage.buildServices.join(',')}`);
    }

    if (Array.isArray(stage.serviceNames) && stage.serviceNames.length > 0) {
      parts.push(`services=${stage.serviceNames.join(',')}`);
    }

    if (stage.failureReason) {
      parts.push(`failure=${stage.failureReason}`);
    } else if (stage.skippedReason) {
      parts.push(`skipped=${stage.skippedReason}`);
    }

    if (stage.durationMs != null) {
      parts.push(`durationMs=${stage.durationMs}`);
    }

    return `- ${parts.join(' | ')}`;
  });
}

function printPlaywrightLastRun({ output, rootDir = ROOT_DIR } = {}) {
  const lastRunPath = path.join(
    rootDir,
    'apps',
    'web',
    'test-results',
    '.last-run.json'
  );

  if (!fs.existsSync(lastRunPath)) {
    writeDiagnosticLine(
      output,
      `[e2e-diagnostics] No Playwright last-run file found at ${path.relative(
        rootDir,
        lastRunPath
      )}.`
    );
    return;
  }

  writeDiagnosticLine(
    output,
    `[e2e-diagnostics] Playwright last-run file: ${path.relative(
      rootDir,
      lastRunPath
    )}`
  );
  writeDiagnosticLine(output, fs.readFileSync(lastRunPath, 'utf8').trim());
}

async function runDiagnosticCommand(
  title,
  command,
  args,
  {
    cwd = ROOT_DIR,
    env = process.env,
    output = process.stderr,
    runCommand: run = runCommand,
  } = {}
) {
  startDiagnosticGroup(title, { env, output });
  writeDiagnosticLine(
    output,
    `[e2e-diagnostics] $ ${command} ${args.join(' ')}`
  );

  try {
    await run(command, args, {
      cwd,
      env: getDiagnosticCommandEnv(env),
      stdio: 'inherit',
    });
  } catch (error) {
    writeDiagnosticLine(
      output,
      `[e2e-diagnostics] Diagnostic command failed: ${getErrorMessage(error)}`
    );
  } finally {
    endDiagnosticGroup({ env, output });
  }
}

async function printE2EFailureDiagnostics({
  env = process.env,
  error,
  output = process.stderr,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  writeDiagnosticLine(output);
  startDiagnosticGroup('E2E failure summary', { env, output });
  writeDiagnosticLine(
    output,
    `[e2e-diagnostics] Primary failure: ${getErrorMessage(error)}`
  );

  const stageLines = formatBlueGreenStages(error?.blueGreenStages);

  if (stageLines.length > 0) {
    writeDiagnosticLine(output, '[e2e-diagnostics] Blue/green stages:');
    for (const line of stageLines) {
      writeDiagnosticLine(output, line);
    }
  }

  printPlaywrightLastRun({ output, rootDir });
  endDiagnosticGroup({ env, output });

  const projectName = getE2EComposeProjectName(env);

  if (projectName) {
    await runDiagnosticCommand(
      'Docker containers for E2E project',
      'docker',
      [
        'ps',
        '-a',
        '--filter',
        `label=com.docker.compose.project=${projectName}`,
        '--format',
        'table {{.Names}}\t{{.Status}}\t{{.Image}}',
      ],
      { cwd: rootDir, env, output, runCommand: run }
    );
  }

  await runDiagnosticCommand(
    'Docker Compose status',
    'docker',
    getDockerComposeDiagnosticArgs(env, 'ps', '-a'),
    { cwd: rootDir, env, output, runCommand: run }
  );
  await runDiagnosticCommand(
    'Docker Compose logs',
    'docker',
    getDockerComposeDiagnosticArgs(
      env,
      'logs',
      '--tail',
      getE2EDiagnosticLogTail(env),
      ...E2E_DIAGNOSTIC_SERVICES
    ),
    { cwd: rootDir, env, output, runCommand: run }
  );
  await runDiagnosticCommand(
    'Docker web proxy login probe',
    'curl',
    ['-i', '--max-time', '10', getWebProxyHealthUrl(env)],
    { cwd: rootDir, env, output, runCommand: run }
  );
  await runDiagnosticCommand('Portless routes', 'bunx', ['portless', 'list'], {
    cwd: rootDir,
    env,
    output,
    runCommand: run,
  });
  await runDiagnosticCommand(
    'Portless login probe',
    'curl',
    ['-k', '-i', '--max-time', '10', getPortlessHealthUrl(env)],
    { cwd: rootDir, env, output, runCommand: run }
  );
  await runDiagnosticCommand('Supabase status', 'bun', ['sb:status'], {
    cwd: rootDir,
    env,
    output,
    runCommand: run,
  });
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
  const acceptedStatusCodes = new Set(options.acceptedStatusCodes ?? []);
  const fetchImpl = options.fetchImpl ?? fetchReadinessUrl;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(
        url,
        getReadinessFetchOptions(url, options)
      );
      const body =
        typeof response.text === 'function' ? await response.text() : '';
      const bodySnippet = getResponseBodySnippet(body);
      const portlessNotReady = isPortlessNotReadyBody(body);

      const readyStatus =
        (response.status >= 200 && response.status < 400) ||
        acceptedStatusCodes.has(response.status);

      if (readyStatus && !portlessNotReady) {
        return;
      }

      lastError = new Error(
        portlessNotReady
          ? `Portless route is not registered for ${url}: ${bodySnippet}`
          : `${url} returned ${response.status}${
              bodySnippet ? `: ${bodySnippet}` : ''
            }`
      );
    } catch (error) {
      lastError = error;
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out waiting for ${url}: ${getErrorMessage(lastError)}`
  );
}

async function ensurePortlessRoute({
  env = process.env,
  output = process.stderr,
  runCommand: run = runCommand,
  runCommandForOutput: runForOutput = runCommandForOutput,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  startDiagnosticGroup('Portless shared localhost route', { env, output });

  try {
    const portlessEnv = getPortlessCommandEnv(env);

    await run('bunx', getPortlessProxyStartArgs(env), {
      cwd: ROOT_DIR,
      env: portlessEnv,
    });

    try {
      await run(
        'bunx',
        ['portless', 'alias', '--remove', PORTLESS_ROUTE_NAME],
        {
          cwd: ROOT_DIR,
          env: portlessEnv,
        }
      );
    } catch (error) {
      writeDiagnosticLine(
        output,
        `[e2e-diagnostics] Existing Portless route was not removed: ${getErrorMessage(
          error
        )}`
      );
    }

    await run(
      'bunx',
      [
        'portless',
        'alias',
        PORTLESS_ROUTE_NAME,
        getWebProxyHostPort(env),
        '--force',
      ],
      {
        cwd: ROOT_DIR,
        env: portlessEnv,
      }
    );

    const verifyAttempts = getPortlessAliasVerifyAttempts(env);
    const verifyDelayMs = getPortlessAliasVerifyDelayMs(env);
    let lastListError = null;
    let lastRouteListOutput = '';

    for (let attempt = 1; attempt <= verifyAttempts; attempt += 1) {
      try {
        const routes = await runForOutput('bunx', ['portless', 'list'], {
          cwd: ROOT_DIR,
          env: portlessEnv,
        });
        lastListError = null;
        lastRouteListOutput = routes.stdout.trim();
        writeDiagnosticLine(output, lastRouteListOutput);

        if (routeListHasPortlessAlias(lastRouteListOutput, env)) {
          return;
        }
      } catch (error) {
        lastListError = error;
        writeDiagnosticLine(
          output,
          `[e2e-diagnostics] Unable to list Portless routes: ${getErrorMessage(
            error
          )}`
        );
      }

      if (attempt < verifyAttempts) {
        await sleep(verifyDelayMs);
      }
    }

    const routeDetail = lastListError
      ? getErrorMessage(lastListError)
      : lastRouteListOutput || 'no Portless routes were returned';

    throw new Error(
      `Portless alias ${PORTLESS_ROUTE_NAME}.localhost was not registered for localhost:${getWebProxyHostPort(
        env
      )}: ${routeDetail}`
    );
  } finally {
    endDiagnosticGroup({ env, output });
  }
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
    DOCKER_WEB_SUPABASE_START_EXCLUDE:
      process.env.DOCKER_WEB_SUPABASE_START_EXCLUDE ??
      process.env.E2E_SUPABASE_START_EXCLUDE ??
      'edge-runtime',
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
    await waitForUrl(getWebProxyHealthUrl(env));
    await ensurePortlessRoute({ env });
    await waitForUrl(getPortlessHealthUrl(env), {
      acceptedStatusCodes: DEFAULT_PORTLESS_READY_STATUS_CODES,
      timeoutMs: DEFAULT_PORTLESS_READY_TIMEOUT_MS,
    });
    await runCommand('bunx', ['playwright', 'test', ...playwrightArgs], {
      cwd: WEB_DIR,
      env,
    });
  } catch (error) {
    runError = error;
    await printE2EFailureDiagnostics({ env, error });
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
  DNS_IPV4_FIRST_NODE_OPTION,
  DEFAULT_ENV_FILE,
  DEFAULT_HEALTH_URL,
  DEFAULT_PORTLESS_BASE_URL,
  DEFAULT_PORTLESS_HEALTH_URL,
  DEFAULT_PORTLESS_ALIAS_VERIFY_ATTEMPTS,
  DEFAULT_PORTLESS_ALIAS_VERIFY_DELAY_MS,
  DEFAULT_PORTLESS_READY_STATUS_CODES,
  DEFAULT_PORTLESS_READY_TIMEOUT_MS,
  DEFAULT_WEB_PROXY_HOST_PORT,
  E2E_COMPOSE_PROJECT_PREFIX,
  ensurePortlessRoute,
  ensureLocalE2EEnvFile,
  formatBlueGreenStages,
  getPortlessAliasVerifyAttempts,
  getPortlessAliasVerifyDelayMs,
  getPortlessCommandEnv,
  getDockerComposeDiagnosticArgs,
  getDockerMemoryLimit,
  getE2EComposeProjectName,
  getE2EDiagnosticLogTail,
  getDockerWebDownArgs,
  getDockerWebUpArgs,
  getPortlessHealthUrl,
  getPortlessProxyStartArgs,
  getReadinessFetchOptions,
  getWebProxyHealthUrl,
  getWebProxyHostPort,
  isPortlessNotReadyBody,
  isE2EComposeProjectName,
  parseE2EProjectImageTags,
  printE2EFailureDiagnostics,
  removeE2EProjectImages,
  routeListHasPortlessAlias,
  runCommand,
  runCommandForOutput,
  runWebE2E,
  shouldKeepStack,
  stopDockerizedE2E,
  waitForUrl,
};
