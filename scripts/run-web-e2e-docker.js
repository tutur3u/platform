#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
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
  LOCAL_E2E_TANSTACK_BASE_URL,
  SAFE_LOCAL_WEB_ORIGINS,
} = require('./e2e-local-environment.js');
const { SKIP_WATCH_HISTORY_ENV } = require('./watch-blue-green/history.js');
const { WATCHER_CONTAINER_ENV } = require('./watch-blue-green-deploy.js');
const {
  getTasksSatellitePortlessEnv,
  getTasksSatellitePlaywrightEnv,
  getTasksSatelliteDependencyBuildArgs,
  printTasksSatelliteLog,
  shouldDiscoverTasksSatelliteFromTestList,
  shouldStartTasksSatellite,
  startTasksSatellite,
  stopTasksSatellite,
  waitForTasksSatellite,
} = require('./e2e-tasks-satellite.js');
const {
  getOwnedSatelliteDependencyBuildArgs,
  getOwnedSatellitePortlessEnv,
  getOwnedSatellitesPlaywrightEnv,
  getRequiredOwnedSatellites,
  printOwnedSatelliteLog,
  shouldDiscoverOwnedSatellitesFromTestList,
  startOwnedSatellite,
  stopOwnedSatellite,
  waitForOwnedSatellite,
} = require('./e2e-owned-satellites.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT_DIR, 'apps', 'web');
const DEFAULT_ENV_FILE = path.join(ROOT_DIR, 'tmp', 'e2e', 'web.env');
const DEFAULT_E2E_COMPARE_REPORT_PATH = path.join(
  ROOT_DIR,
  'tmp',
  'e2e',
  'web-migration',
  'compare-report.json'
);
const DEFAULT_E2E_PLAYWRIGHT_JSON_REPORT_DIR = path.join(
  ROOT_DIR,
  'tmp',
  'e2e',
  'web-migration',
  'playwright-json'
);
const DEFAULT_HEALTH_URL = 'http://127.0.0.1:7803/login';
const DEFAULT_PORTLESS_BASE_URL = LOCAL_E2E_BASE_URL;
const DEFAULT_PORTLESS_HEALTH_URL = `${DEFAULT_PORTLESS_BASE_URL}/login`;
const DEFAULT_TANSTACK_PORTLESS_BASE_URL = LOCAL_E2E_TANSTACK_BASE_URL;
const DEFAULT_PORTLESS_READY_STATUS_CODES = Object.freeze([404]);
const DEFAULT_PORTLESS_READY_TIMEOUT_MS = 300_000;
const DEFAULT_DIAGNOSTIC_LOG_TAIL = '300';
const DEFAULT_DOCKER_BUILD_CPUS = '4';
const DEFAULT_DOCKER_BUILD_MAX_PARALLELISM = '1';
const DEFAULT_E2E_DOCKER_NATIVE_BUILD = '1';
const DEFAULT_E2E_DOCKER_WEB_CRON_RUNNER_ENABLED = '0';
const TANSTACK_WEB_PROXY_HEALTH_PATH = '/';
const DEFAULT_REUSABLE_LOCAL_REDIS_REST_PROBE_URL = 'http://127.0.0.1:8079/';
const DEFAULT_REUSABLE_LOCAL_REDIS_REST_URL =
  'http://host.docker.internal:8079';
const DEFAULT_REUSABLE_LOCAL_REDIS_REST_TOKEN = 'example_token';
const E2E_COMPOSE_PROJECT_PREFIX = 'ttr-e2e-';
const PORTLESS_ROUTE_NAME = 'tuturuuu';
const TANSTACK_PORTLESS_ROUTE_NAME = 'tanstack.tuturuuu';
const DEFAULT_WEB_PROXY_HOST_PORT = '7803';
const DEFAULT_TANSTACK_DIRECT_HOST_PORT = '7824';
const TANSTACK_WEB_PROXY_TARGET_OPT_IN_ENV =
  'E2E_ALLOW_TANSTACK_WEB_PROXY_PORT';
const DNS_IPV4_FIRST_NODE_OPTION = '--dns-result-order=ipv4first';
const DEFAULT_PORTLESS_ALIAS_VERIFY_ATTEMPTS = 3;
const DEFAULT_PORTLESS_ALIAS_VERIFY_DELAY_MS = 1_000;
const DEFAULT_PORTLESS_RUNTIME_DIR = path.join(os.homedir(), '.portless');
const DEFAULT_PORTLESS_PROXY_TLS_MARKER = path.join(
  DEFAULT_PORTLESS_RUNTIME_DIR,
  'proxy.tls'
);
const E2E_DIAGNOSTIC_SERVICES = Object.freeze([
  'web-proxy',
  'web-blue',
  'web-green',
  'tanstack-web',
  'tanstack-web-blue',
  'tanstack-web-green',
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
const BLUE_GREEN_COLORS = Object.freeze(['blue', 'green']);
const DEFAULT_REUSABLE_WEB_IMAGE_PROJECT = 'tuturuuu';
const DEFAULT_REUSABLE_WEB_IMAGE_COLOR = 'blue';
const REUSABLE_SUPPORT_IMAGE_SERVICES = Object.freeze([
  'backend',
  'hive-realtime',
  'meet-realtime',
  'markitdown',
  'storage-unzip-proxy',
  'supermemory',
  'web-cron-runner',
]);
const BLUE_GREEN_ACTIVE_COLOR_FILE = path.join(
  ROOT_DIR,
  'tmp',
  'docker-web',
  'prod',
  'active-color'
);
const E2E_FRONTENDS = new Set(['next', 'tanstack', 'compare']);
const E2E_COMPARE_FRONTEND_IMAGE_SERVICES = Object.freeze({
  next: Object.freeze(['web-blue', 'web-green']),
  tanstack: Object.freeze([
    'tanstack-web',
    'tanstack-web-blue',
    'tanstack-web-green',
  ]),
});

function getDockerWebUpArgs(envFilePath, env = process.env) {
  return [
    'up',
    '--mode',
    'prod',
    '--strategy',
    'blue-green',
    ...(env.E2E_DOCKER_SUPABASE_RESET === '0'
      ? ['--with-supabase']
      : ['--reset-supabase']),
    ...(isReusingLocalRedis(env) ? ['--without-redis'] : []),
    '--build-memory',
    env.E2E_DOCKER_BUILD_MEMORY ?? 'auto',
    '--build-cpus',
    env.E2E_DOCKER_BUILD_CPUS ?? DEFAULT_DOCKER_BUILD_CPUS,
    '--build-max-parallelism',
    env.E2E_DOCKER_BUILD_MAX_PARALLELISM ??
      DEFAULT_DOCKER_BUILD_MAX_PARALLELISM,
    '--env-file',
    envFilePath,
  ];
}

function getE2EDockerNativeBuildValue(env = process.env) {
  return (
    env.E2E_DOCKER_NATIVE_BUILD ??
    env.DOCKER_WEB_NATIVE_BUILD ??
    DEFAULT_E2E_DOCKER_NATIVE_BUILD
  );
}

function getE2EDockerNativeSupportBuildValue(env = process.env) {
  return (
    env.E2E_DOCKER_NATIVE_SUPPORT_BUILD ??
    env.DOCKER_WEB_NATIVE_SUPPORT_BUILD ??
    '1'
  );
}

function getE2EDockerCronRunnerEnabledValue(env = process.env) {
  return (
    env.E2E_DOCKER_WEB_CRON_RUNNER_ENABLED ??
    env.DOCKER_WEB_CRON_RUNNER_ENABLED ??
    DEFAULT_E2E_DOCKER_WEB_CRON_RUNNER_ENABLED
  );
}

function getDockerWebDownArgs(
  envFilePath,
  env = process.env,
  { preserveImages = false } = {}
) {
  const args = [
    'down',
    '--mode',
    'prod',
    '--strategy',
    'blue-green',
    ...(isReusingLocalRedis(env) ? ['--without-redis'] : []),
    '--env-file',
    envFilePath,
    '--volumes',
  ];

  if (!preserveImages && !env.DOCKER_WEB_REUSED_WEB_IMAGE_SOURCE) {
    args.push('--rmi', 'local');
  }

  return args;
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
  const healthPath = env.E2E_PORTLESS_HEALTH_PATH ?? '/login';

  try {
    const url = new URL(baseUrl);
    url.pathname = healthPath.startsWith('/') ? healthPath : `/${healthPath}`;
    url.search = '';
    url.hash = '';

    return url.toString();
  } catch {
    return DEFAULT_PORTLESS_HEALTH_URL;
  }
}

function parseE2EFrontendArgs(playwrightArgs = [], env = process.env) {
  const filteredArgs = [];
  let frontend = env.DOCKER_WEB_FRONTEND || 'next';

  for (let index = 0; index < playwrightArgs.length; index += 1) {
    const arg = playwrightArgs[index];

    if (arg === '--frontend') {
      frontend = playwrightArgs[index + 1];
      index += 1;
      continue;
    }

    const frontendMatch = arg.match(/^--frontend=(.+)$/u);
    if (frontendMatch) {
      frontend = frontendMatch[1];
      continue;
    }

    filteredArgs.push(arg);
  }

  if (!E2E_FRONTENDS.has(frontend)) {
    throw new Error(
      `Unsupported Docker web E2E frontend "${frontend}". Expected next, tanstack, or compare.`
    );
  }

  return {
    frontend,
    playwrightArgs: filteredArgs,
  };
}

function getE2ECompareReportPath(env = process.env) {
  const configuredPath = String(env.E2E_COMPARE_REPORT_PATH ?? '').trim();

  return configuredPath
    ? path.resolve(configuredPath)
    : DEFAULT_E2E_COMPARE_REPORT_PATH;
}

function isInsideDirectory(candidatePath, parentPath) {
  const relativePath = path.relative(parentPath, candidatePath);

  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function resolveSafeE2ECompareReportPath(reportPath, rootDir = ROOT_DIR) {
  const resolvedReportPath = path.resolve(reportPath);
  const tmpDir = path.join(rootDir, 'tmp');

  if (!isInsideDirectory(resolvedReportPath, tmpDir)) {
    throw new Error(
      `Docker E2E compare reports must be written under ${path.relative(
        rootDir,
        tmpDir
      )}; got ${path.relative(rootDir, resolvedReportPath)}.`
    );
  }

  return resolvedReportPath;
}

function isPassedE2EResult(result) {
  return (
    result?.passed === true ||
    ['passed', 'pass', 'ok', 'success'].includes(
      String(result?.status ?? '').toLowerCase()
    )
  );
}

function normalizeE2ECompareResult(result) {
  const normalized = { ...result };
  const durationMs = Number(normalized.durationMs);
  const executedCount = Number(normalized.executedCount);
  const passedCount = Number(normalized.passedCount);

  if (normalized.wallMs === undefined && Number.isFinite(durationMs)) {
    normalized.wallMs = durationMs;
  }

  if (
    normalized.passRate === undefined &&
    Number.isFinite(executedCount) &&
    executedCount > 0 &&
    Number.isFinite(passedCount)
  ) {
    normalized.passRate = passedCount / executedCount;
  } else if (normalized.passRate === undefined) {
    normalized.passRate = isPassedE2EResult(normalized) ? 1 : 0;
  }

  return normalized;
}

function getFrontendE2EBaseUrl(frontend, env = process.env) {
  const fallback =
    frontend === 'tanstack'
      ? DEFAULT_TANSTACK_PORTLESS_BASE_URL
      : DEFAULT_PORTLESS_BASE_URL;
  const envValue =
    frontend === 'tanstack' ? env.TANSTACK_WEB_E2E_BASE_URL : env.BASE_URL;
  const value = typeof envValue === 'string' ? envValue.trim() : '';

  return value || fallback;
}

function normalizeFrontendE2EOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    if (url.username || url.password) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function getE2EPlaywrightJsonReportPath(frontend, env = process.env) {
  const reportDir = path.resolve(
    env.E2E_PLAYWRIGHT_JSON_REPORT_DIR ?? DEFAULT_E2E_PLAYWRIGHT_JSON_REPORT_DIR
  );

  return path.join(reportDir, `${frontend}-report.json`);
}

function withPlaywrightJsonReporterArgs(playwrightArgs = []) {
  const filteredArgs = [];

  for (let index = 0; index < playwrightArgs.length; index += 1) {
    const arg = playwrightArgs[index];

    if (arg === '--reporter') {
      index += 1;
      continue;
    }

    if (arg.startsWith('--reporter=')) {
      continue;
    }

    filteredArgs.push(arg);
  }

  return [...filteredArgs, '--reporter=json'];
}

function getPlaywrightJsonSummary(reportPath, fsImpl = fs) {
  const report = JSON.parse(fsImpl.readFileSync(reportPath, 'utf8'));
  const stats = report.stats ?? {};
  const passedCount = Math.max(0, Number(stats.expected) || 0);
  const failedCount = Math.max(0, Number(stats.unexpected) || 0);
  const flakyCount = Math.max(0, Number(stats.flaky) || 0);
  const skippedCount = Math.max(0, Number(stats.skipped) || 0);
  const executedCount = passedCount + failedCount + flakyCount;

  return {
    executedCount,
    failedCount,
    flakyCount,
    passedCount,
    skippedCount,
    testCount: executedCount + skippedCount,
  };
}

function createE2ECompareReport(frontends, generatedAt = new Date()) {
  const next = normalizeE2ECompareResult(
    frontends.next ?? { passed: false, status: 'missing' }
  );
  const tanstack = normalizeE2ECompareResult(
    frontends.tanstack ?? { passed: false, status: 'missing' }
  );
  const origins = {
    next: normalizeFrontendE2EOrigin(next.origin),
    tanstack: normalizeFrontendE2EOrigin(tanstack.origin),
  };
  next.origin = origins.next;
  tanstack.origin = origins.tanstack;
  const passed = next.passed === true && tanstack.passed === true;

  return {
    frontend: 'compare',
    frontends: {
      next,
      tanstack,
    },
    generatedAt: generatedAt.toISOString(),
    origins,
    passed,
    status: passed ? 'passed' : 'failed',
  };
}

function writeE2ECompareReport({
  fsImpl = fs,
  output = process.stderr,
  report,
  reportPath = getE2ECompareReportPath(),
  rootDir = ROOT_DIR,
} = {}) {
  const resolvedReportPath = resolveSafeE2ECompareReportPath(
    reportPath,
    rootDir
  );

  fsImpl.mkdirSync(path.dirname(resolvedReportPath), { recursive: true });
  fsImpl.writeFileSync(
    resolvedReportPath,
    `${JSON.stringify(report, null, 2)}\n`
  );
  writeDiagnosticLine(
    output,
    `[e2e-diagnostics] Docker E2E compare report: ${path.relative(
      rootDir,
      resolvedReportPath
    )}`
  );

  return resolvedReportPath;
}

async function runFrontendE2EForCompare(
  frontend,
  playwrightArgs,
  options = {}
) {
  const { runWebE2EForFrontend = runWebE2E, ...runOptions } = options;
  const compareEnv = {
    ...process.env,
    ...(runOptions.env ?? {}),
  };
  const startedAt = Date.now();
  const origin = normalizeFrontendE2EOrigin(
    getFrontendE2EBaseUrl(frontend, compareEnv)
  );
  const playwrightJsonReportPath = getE2EPlaywrightJsonReportPath(
    frontend,
    compareEnv
  );

  fs.mkdirSync(path.dirname(playwrightJsonReportPath), { recursive: true });
  fs.rmSync(playwrightJsonReportPath, { force: true });

  try {
    await runWebE2EForFrontend([], {
      ...runOptions,
      env: {
        ...(runOptions.env ?? {}),
        PLAYWRIGHT_JSON_OUTPUT_NAME: playwrightJsonReportPath,
      },
      frontend,
      playwrightArgs: withPlaywrightJsonReporterArgs(playwrightArgs),
    });
    const summary = getPlaywrightJsonSummary(playwrightJsonReportPath);

    return {
      durationMs: Date.now() - startedAt,
      origin,
      passed: true,
      playwright: {
        reporter: 'json',
        reportPath: path.relative(ROOT_DIR, playwrightJsonReportPath),
      },
      ...summary,
      status: 'passed',
    };
  } catch (error) {
    return {
      durationMs: Date.now() - startedAt,
      error: getErrorMessage(error),
      origin,
      passed: false,
      status: 'failed',
    };
  }
}

function getFrontendE2EEnv(frontend, env = process.env) {
  if (frontend === 'tanstack') {
    const baseUrl = getFrontendE2EBaseUrl('tanstack', env);

    return {
      ...env,
      BASE_URL: baseUrl,
      DOCKER_WEB_FRONTEND: 'tanstack',
      E2E_PORTLESS_HEALTH_PATH: env.E2E_PORTLESS_HEALTH_PATH ?? '/',
      PORTLESS_ROUTE_NAME: TANSTACK_PORTLESS_ROUTE_NAME,
      TANSTACK_WEB_E2E_BASE_URL: baseUrl,
    };
  }

  return {
    ...env,
    BASE_URL: getFrontendE2EBaseUrl('next', env),
    DOCKER_WEB_FRONTEND: 'next',
  };
}

function getWebProxyHostPort(env = process.env) {
  const value = String(
    env.DOCKER_WEB_PROXY_HOST_PORT ?? DEFAULT_WEB_PROXY_HOST_PORT
  ).trim();

  return /^\d+$/u.test(value) && Number.parseInt(value, 10) > 0
    ? value
    : DEFAULT_WEB_PROXY_HOST_PORT;
}

function getTanStackDirectHostPort(env = process.env) {
  const value = String(
    env.DOCKER_TANSTACK_WEB_DIRECT_HOST_PORT ??
      DEFAULT_TANSTACK_DIRECT_HOST_PORT
  ).trim();

  return /^\d+$/u.test(value) && Number.parseInt(value, 10) > 0
    ? value
    : DEFAULT_TANSTACK_DIRECT_HOST_PORT;
}

function getWebProxyHealthUrl(env = process.env) {
  const value =
    typeof env.E2E_WEB_PROXY_HEALTH_URL === 'string'
      ? env.E2E_WEB_PROXY_HEALTH_URL.trim()
      : '';

  if (value) {
    return value;
  }

  const healthPath =
    env.DOCKER_WEB_FRONTEND === 'tanstack'
      ? TANSTACK_WEB_PROXY_HEALTH_PATH
      : '/login';

  return `http://127.0.0.1:${getWebProxyHostPort(env)}${healthPath}`;
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

function removePortlessProxyTlsMarker({
  fsImpl = fs,
  markerPath = DEFAULT_PORTLESS_PROXY_TLS_MARKER,
  output = process.stderr,
} = {}) {
  try {
    if (!fsImpl.existsSync(markerPath)) {
      return false;
    }

    fsImpl.rmSync(markerPath, { force: true });
    writeDiagnosticLine(
      output,
      `[e2e-diagnostics] Removed stale Portless TLS marker at ${markerPath}.`
    );

    return true;
  } catch (error) {
    writeDiagnosticLine(
      output,
      `[e2e-diagnostics] Unable to remove Portless TLS marker at ${markerPath}: ${getErrorMessage(
        error
      )}`
    );

    return false;
  }
}

function isPortlessProxyConfigMismatchError(error) {
  const message = getErrorMessage(error);

  return (
    /proxy is already running on port/iu.test(message) &&
    /different config/iu.test(message)
  );
}

function isPortlessProxyStartExitError(error, args = []) {
  const message = getErrorMessage(error);
  const command = `bunx ${args.join(' ')}`;

  return (
    args.slice(0, 3).join(' ') === 'portless proxy start' &&
    message.includes(command) &&
    /exited with (?:\d+|error)/iu.test(message)
  );
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

function getE2EPortlessRouteName(env = process.env) {
  return String(env.PORTLESS_ROUTE_NAME || PORTLESS_ROUTE_NAME).trim();
}

function isTanStackPortlessRoute(env = process.env) {
  return (
    getE2EPortlessRouteName(env) === TANSTACK_PORTLESS_ROUTE_NAME ||
    env.DOCKER_WEB_FRONTEND === 'tanstack'
  );
}

function getE2EPortlessTargetPort(env = process.env) {
  if (!isTanStackPortlessRoute(env) || env.DOCKER_WEB_FRONTEND === 'tanstack') {
    return getWebProxyHostPort(env);
  }

  const targetPort = getTanStackDirectHostPort(env);
  const webProxyPort = getWebProxyHostPort(env);

  if (
    targetPort === webProxyPort &&
    !isTruthyEnvValue(env[TANSTACK_WEB_PROXY_TARGET_OPT_IN_ENV])
  ) {
    throw new Error(
      `Refusing to alias the TanStack Portless route to the Next web proxy port ${webProxyPort}. Set ${TANSTACK_WEB_PROXY_TARGET_OPT_IN_ENV}=1 only for an intentional proxy-routing test.`
    );
  }

  return targetPort;
}

function routeListHasPortlessAlias(routeListOutput, env = process.env) {
  const output = String(routeListOutput ?? '');
  const targetPort = getE2EPortlessTargetPort(env);
  const routeName = getE2EPortlessRouteName(env);
  const aliasPatterns = [
    new RegExp(`\\b${routeName}\\.localhost\\b`, 'iu'),
    new RegExp(`\\b${routeName}\\b`, 'iu'),
  ];
  const hostPortPattern = new RegExp(
    `(?:localhost|127\\.0\\.0\\.1):?${targetPort}\\b`,
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

  if (
    Number.isFinite(options.requestTimeoutMs) &&
    options.requestTimeoutMs > 0
  ) {
    fetchOptions.requestTimeoutMs = options.requestTimeoutMs;
    fetchOptions.signal = AbortSignal.timeout(options.requestTimeoutMs);
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
    'Docker web proxy readiness probe',
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
    const proxyStartArgs = getPortlessProxyStartArgs(env);
    const routeName = getE2EPortlessRouteName(env);

    removePortlessProxyTlsMarker({ output });

    try {
      await run('bunx', proxyStartArgs, {
        cwd: ROOT_DIR,
        env: portlessEnv,
      });
    } catch (error) {
      if (
        !isPortlessProxyConfigMismatchError(error) &&
        !isPortlessProxyStartExitError(error, proxyStartArgs)
      ) {
        throw error;
      }

      writeDiagnosticLine(
        output,
        `[e2e-diagnostics] Restarting Portless proxy with requested HTTPS settings: ${getErrorMessage(
          error
        )}`
      );
      await run('bunx', ['portless', 'proxy', 'stop'], {
        cwd: ROOT_DIR,
        env: portlessEnv,
      });
      removePortlessProxyTlsMarker({ output });
      await run('bunx', proxyStartArgs, {
        cwd: ROOT_DIR,
        env: portlessEnv,
      });
    }

    try {
      await run('bunx', ['portless', 'alias', '--remove', routeName], {
        cwd: ROOT_DIR,
        env: portlessEnv,
      });
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
        routeName,
        getE2EPortlessTargetPort(env),
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
      `Portless alias ${routeName}.localhost was not registered for localhost:${getE2EPortlessTargetPort(
        env
      )}: ${routeDetail}`
    );
  } finally {
    endDiagnosticGroup({ env, output });
  }
}

function ensureLocalE2EEnvFile(envFilePath, overrides = {}) {
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(envFilePath, createLocalE2EEnvFileContent(overrides), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function isTruthyEnvValue(value) {
  return /^(1|true|yes|on)$/iu.test(String(value ?? '').trim());
}

function isFalsyEnvValue(value) {
  return /^(0|false|no|off)$/iu.test(String(value ?? '').trim());
}

function getFirstNonBlank(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const value = candidate.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function isReusingLocalRedis(env = process.env) {
  return isTruthyEnvValue(env.E2E_REUSED_LOCAL_REDIS);
}

function getReusableLocalRedisRuntime(env = process.env) {
  return {
    probeUrl:
      getFirstNonBlank([env.E2E_REUSE_LOCAL_REDIS_REST_PROBE_URL]) ??
      DEFAULT_REUSABLE_LOCAL_REDIS_REST_PROBE_URL,
    token:
      getFirstNonBlank([
        env.E2E_REUSE_LOCAL_REDIS_REST_TOKEN,
        env.DOCKER_UPSTASH_REDIS_REST_TOKEN,
      ]) ?? DEFAULT_REUSABLE_LOCAL_REDIS_REST_TOKEN,
    url:
      getFirstNonBlank([
        env.E2E_REUSE_LOCAL_REDIS_REST_URL,
        env.DOCKER_UPSTASH_REDIS_REST_URL,
      ]) ?? DEFAULT_REUSABLE_LOCAL_REDIS_REST_URL,
  };
}

function isReusableLocalRedisResponse(response, body) {
  if (!response || response.status < 200 || response.status >= 500) {
    return false;
  }

  return /Serverless Redis HTTP|SRH:/iu.test(String(body ?? ''));
}

async function probeReusableLocalRedis(
  runtime,
  { fetchImpl = fetchReadinessUrl } = {}
) {
  const response = await fetchImpl(runtime.probeUrl, {
    redirect: 'manual',
    requestTimeoutMs: 5_000,
  });
  const body = typeof response.text === 'function' ? await response.text() : '';

  return isReusableLocalRedisResponse(response, body);
}

async function resolveReusableLocalRedisRuntime({
  env = process.env,
  fetchImpl = fetchReadinessUrl,
  output = process.stderr,
} = {}) {
  if (isFalsyEnvValue(env.E2E_REUSE_LOCAL_REDIS)) {
    return null;
  }

  const forced = isTruthyEnvValue(env.E2E_REUSE_LOCAL_REDIS);
  const runtime = getReusableLocalRedisRuntime(env);

  try {
    if (!(await probeReusableLocalRedis(runtime, { fetchImpl }))) {
      if (forced) {
        throw new Error(
          `Expected a Serverless Redis HTTP bridge at ${runtime.probeUrl}.`
        );
      }

      return null;
    }
  } catch (error) {
    if (forced) {
      throw error;
    }

    return null;
  }

  if (output) {
    writeDiagnosticLine(
      output,
      `[e2e-diagnostics] Reusing local Redis HTTP bridge at ${runtime.probeUrl}.`
    );
  }

  return runtime;
}

function shouldKeepStack(env = process.env) {
  return isTruthyEnvValue(env.E2E_KEEP_DOCKER_STACK);
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

function normalizeBlueGreenColor(value) {
  const color = String(value ?? '')
    .trim()
    .toLowerCase();

  return BLUE_GREEN_COLORS.includes(color) ? color : null;
}

function readReusableWebImageColor({
  activeColorFile = BLUE_GREEN_ACTIVE_COLOR_FILE,
  env = process.env,
  fsImpl = fs,
} = {}) {
  const explicitColor = String(env.E2E_DOCKER_REUSE_WEB_IMAGE_COLOR ?? '')
    .trim()
    .toLowerCase();

  if (explicitColor && explicitColor !== 'auto') {
    const color = normalizeBlueGreenColor(explicitColor);

    if (!color) {
      throw new Error(
        'E2E_DOCKER_REUSE_WEB_IMAGE_COLOR must be "blue", "green", or "auto".'
      );
    }

    return color;
  }

  try {
    if (fsImpl.existsSync(activeColorFile)) {
      return (
        normalizeBlueGreenColor(fsImpl.readFileSync(activeColorFile, 'utf8')) ??
        DEFAULT_REUSABLE_WEB_IMAGE_COLOR
      );
    }
  } catch {
    return DEFAULT_REUSABLE_WEB_IMAGE_COLOR;
  }

  return DEFAULT_REUSABLE_WEB_IMAGE_COLOR;
}

function getReusableWebImageProject(env = process.env) {
  const projectName = String(
    env.E2E_DOCKER_REUSE_WEB_IMAGE_PROJECT ?? DEFAULT_REUSABLE_WEB_IMAGE_PROJECT
  ).trim();

  return projectName || DEFAULT_REUSABLE_WEB_IMAGE_PROJECT;
}

function getReusableWebImageRef(projectName, color) {
  const normalizedColor = normalizeBlueGreenColor(color);

  if (!normalizedColor) {
    throw new Error(`Unsupported blue/green color "${color}".`);
  }

  return `${projectName}-web-${normalizedColor}`;
}

function getReusableHiveImageRef(projectName, color) {
  const normalizedColor = normalizeBlueGreenColor(color);

  if (!normalizedColor) {
    throw new Error(`Unsupported blue/green color "${color}".`);
  }

  return `${projectName}-hive-${normalizedColor}`;
}

function getReusableSupportImageRef(projectName, serviceName) {
  const service = String(serviceName ?? '').trim();

  if (!REUSABLE_SUPPORT_IMAGE_SERVICES.includes(service)) {
    throw new Error(`Unsupported reusable support service "${serviceName}".`);
  }

  return `${projectName}-${service}`;
}

function getReusableWebImageSource(env = process.env, options = {}) {
  const explicitSource = String(
    env.E2E_DOCKER_REUSE_WEB_IMAGE_SOURCE ?? ''
  ).trim();

  if (explicitSource) {
    return explicitSource;
  }

  const value = String(env.E2E_DOCKER_REUSE_WEB_IMAGE ?? '').trim();

  if (!value || isFalsyEnvValue(value)) {
    return null;
  }

  if (!isTruthyEnvValue(value)) {
    return value;
  }

  return getReusableWebImageRef(
    getReusableWebImageProject(env),
    readReusableWebImageColor({
      activeColorFile: options.activeColorFile,
      env,
      fsImpl: options.fsImpl ?? fs,
    })
  );
}

function getReusableWebImageTargets(projectName) {
  if (!isE2EComposeProjectName(projectName)) {
    throw new Error(
      'Reusable Docker web image targets require a ttr-e2e-* Compose project.'
    );
  }

  return BLUE_GREEN_COLORS.map((color) =>
    getReusableWebImageRef(projectName, color)
  );
}

function getReusableSupportImageSpecs({
  sourceColor = DEFAULT_REUSABLE_WEB_IMAGE_COLOR,
  sourceProject = DEFAULT_REUSABLE_WEB_IMAGE_PROJECT,
  targetProject,
} = {}) {
  if (!isE2EComposeProjectName(targetProject)) {
    throw new Error(
      'Reusable Docker support image targets require a ttr-e2e-* Compose project.'
    );
  }

  return [
    {
      source: getReusableHiveImageRef(sourceProject, sourceColor),
      targets: BLUE_GREEN_COLORS.map((color) =>
        getReusableHiveImageRef(targetProject, color)
      ),
    },
    ...REUSABLE_SUPPORT_IMAGE_SERVICES.map((serviceName) => ({
      source: getReusableSupportImageRef(sourceProject, serviceName),
      targets: [getReusableSupportImageRef(targetProject, serviceName)],
    })),
  ];
}

function hasExplicitDockerImageTag(imageRef) {
  const ref = String(imageRef ?? '').trim();

  if (!ref || ref.includes('@')) {
    return true;
  }

  return ref.lastIndexOf(':') > ref.lastIndexOf('/');
}

function getDockerImageRefCandidates(imageRef) {
  const ref = String(imageRef ?? '').trim();

  if (!ref) {
    return [];
  }

  const candidates = [ref];

  if (!hasExplicitDockerImageTag(ref)) {
    candidates.push(`${ref}:latest`);
  }

  return candidates;
}

function resolveReusableWebImageSourceFromList(imageRef, imageListOutput) {
  const candidates = new Set(getDockerImageRefCandidates(imageRef));

  for (const line of String(imageListOutput ?? '').split(/\r?\n/u)) {
    const [repositoryTag, imageId] = line.trim().split(/\s+/u);

    if (repositoryTag && candidates.has(repositoryTag)) {
      return imageId || repositoryTag;
    }
  }

  return null;
}

async function inspectReusableWebImageSource({
  env = process.env,
  runCommandForOutput: runForOutput = runCommandForOutput,
  source,
} = {}) {
  try {
    await runForOutput('docker', ['image', 'inspect', source], { env });
    return source;
  } catch (directInspectError) {
    const imageList = await runForOutput(
      'docker',
      ['image', 'ls', '--format', '{{.Repository}}:{{.Tag}} {{.ID}}'],
      { env }
    );
    const resolvedSource = resolveReusableWebImageSourceFromList(
      source,
      imageList.stdout
    );

    if (!resolvedSource) {
      throw directInspectError;
    }

    await runForOutput('docker', ['image', 'inspect', resolvedSource], {
      env,
    });

    return resolvedSource;
  }
}

async function prepareReusableWebImage({
  env = process.env,
  output = process.stderr,
  projectName = getE2EComposeProjectName(env),
  runCommand: run = runCommand,
  runCommandForOutput: runForOutput = runCommandForOutput,
  ...sourceOptions
} = {}) {
  const source = getReusableWebImageSource(env, sourceOptions);

  if (!source) {
    return null;
  }

  const targets = getReusableWebImageTargets(projectName);
  const sourceRef = await inspectReusableWebImageSource({
    env,
    runCommandForOutput: runForOutput,
    source,
  });

  for (const target of targets) {
    await run('docker', ['tag', sourceRef, target], { env });
  }

  if (output) {
    writeDiagnosticLine(
      output,
      `[e2e-diagnostics] Reusing Docker web image ${source}${
        sourceRef === source ? '' : ` (${sourceRef})`
      } as ${targets.join(', ')}.`
    );
  }

  return { source, sourceRef, targets };
}

async function prepareReusableSupportImages({
  env = process.env,
  output = process.stderr,
  projectName = getE2EComposeProjectName(env),
  runCommand: run = runCommand,
  runCommandForOutput: runForOutput = runCommandForOutput,
  ...sourceOptions
} = {}) {
  if (!getReusableWebImageSource(env, sourceOptions)) {
    return null;
  }

  const sourceProject = getReusableWebImageProject(env);
  const sourceColor = readReusableWebImageColor({
    activeColorFile: sourceOptions.activeColorFile,
    env,
    fsImpl: sourceOptions.fsImpl ?? fs,
  });
  const specs = getReusableSupportImageSpecs({
    sourceColor,
    sourceProject,
    targetProject: projectName,
  });
  const missing = [];
  const retagged = [];

  for (const spec of specs) {
    let sourceRef;

    try {
      sourceRef = await inspectReusableWebImageSource({
        env,
        runCommandForOutput: runForOutput,
        source: spec.source,
      });
    } catch {
      missing.push(spec.source);
      continue;
    }

    for (const target of spec.targets) {
      await run('docker', ['tag', sourceRef, target], { env });
    }

    retagged.push({ ...spec, sourceRef });
  }

  if (missing.length > 0) {
    if (output) {
      writeDiagnosticLine(
        output,
        `[e2e-diagnostics] Reusable Docker support image set incomplete; missing ${missing.join(
          ', '
        )}. Support services will be built normally.`
      );
    }

    return {
      complete: false,
      missing,
      retagged,
      targets: retagged.flatMap((spec) => spec.targets),
    };
  }

  const targets = retagged.flatMap((spec) => spec.targets);

  if (output) {
    writeDiagnosticLine(
      output,
      `[e2e-diagnostics] Reusing Docker support images from ${sourceProject} ${sourceColor} as ${targets.join(
        ', '
      )}.`
    );
  }

  return {
    complete: true,
    missing: [],
    retagged,
    targets,
  };
}

function parseE2EProjectImageTags(
  imageListOutput,
  projectName,
  { imageServices } = {}
) {
  if (!isE2EComposeProjectName(projectName)) {
    return [];
  }

  const repositoryPrefix = `${projectName}-`;
  const allowedServices =
    Array.isArray(imageServices) && imageServices.length > 0
      ? new Set(imageServices)
      : null;
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

    if (!repository.startsWith(repositoryPrefix)) {
      continue;
    }

    const service = repository.slice(repositoryPrefix.length);

    if (allowedServices && !allowedServices.has(service)) {
      continue;
    }

    tags.add(imageRef);
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
  imageServices,
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
  const imageTags = parseE2EProjectImageTags(imageList.stdout, projectName, {
    imageServices,
  });

  if (imageTags.length === 0) {
    return [];
  }

  await run('docker', ['image', 'rm', ...imageTags], { env });
  return imageTags;
}

async function stopDockerizedE2E({
  env,
  envFilePath,
  imageServicesToRemove,
  preserveImages = false,
}) {
  const removeSelectedImages =
    !preserveImages &&
    Array.isArray(imageServicesToRemove) &&
    imageServicesToRemove.length > 0;

  await runDockerWebWorkflow(
    parseDockerWebArgs(
      getDockerWebDownArgs(envFilePath, env, {
        preserveImages: preserveImages || removeSelectedImages,
      })
    ),
    {
      env,
      envFilePath,
      rootDir: ROOT_DIR,
    }
  );
  if (removeSelectedImages) {
    await removeE2EProjectImages({ env, imageServices: imageServicesToRemove });
  } else if (!preserveImages) {
    await removeE2EProjectImages({ env });
  }
  await runCommand('bun', ['sb:stop'], { env, cwd: ROOT_DIR });
}

async function runWebE2E(playwrightArgs = process.argv.slice(2), options = {}) {
  const frontendArgs =
    options.frontend && options.playwrightArgs
      ? {
          frontend: options.frontend,
          playwrightArgs: options.playwrightArgs,
        }
      : parseE2EFrontendArgs(playwrightArgs, process.env);

  if (frontendArgs.frontend === 'compare') {
    const {
      runFrontendE2EForCompare:
        runFrontendForCompare = runFrontendE2EForCompare,
      ...compareOptions
    } = options;
    const compareEnv = {
      ...process.env,
      ...(compareOptions.env ?? {}),
    };
    const frontends = {
      next: await runFrontendForCompare('next', frontendArgs.playwrightArgs, {
        ...compareOptions,
        dockerProjectImageServicesToRemove:
          E2E_COMPARE_FRONTEND_IMAGE_SERVICES.next,
        preserveDockerProjectImages: false,
      }),
      tanstack: await runFrontendForCompare(
        'tanstack',
        frontendArgs.playwrightArgs,
        compareOptions
      ),
    };
    const report = createE2ECompareReport(frontends);
    const reportPath = getE2ECompareReportPath(compareEnv);
    writeE2ECompareReport({
      report,
      reportPath,
    });

    if (!report.passed) {
      const failures = Object.entries(frontends)
        .filter(([, result]) => result.passed !== true)
        .map(
          ([frontend, result]) =>
            `${frontend}: ${result.error ?? 'unknown failure'}`
        );
      throw new Error(
        `Docker E2E compare failed. See ${path.relative(
          ROOT_DIR,
          reportPath
        )}. ${failures.join(' ')}`
      );
    }

    return;
  }

  const envFilePath = options.envFilePath ?? DEFAULT_ENV_FILE;
  ensureLocalE2EEnvFile(envFilePath);

  let env = {
    ...createLocalE2EProcessEnv(process.env, {
      envFilePath,
      rootDir: ROOT_DIR,
    }),
    ...(options.env ?? {}),
    [SKIP_WATCH_HISTORY_ENV]: '1',
    [WATCHER_CONTAINER_ENV]: '1',
    DOCKER_WEB_BUILDKIT_PRUNE_AFTER_BUILD:
      process.env.E2E_DOCKER_BUILDKIT_PRUNE_AFTER_BUILD ?? '1',
    DOCKER_WEB_BUILDKIT_PRUNE_MODE:
      process.env.E2E_DOCKER_BUILDKIT_PRUNE_MODE ?? 'all',
    DOCKER_WEB_NATIVE_BUILD: getE2EDockerNativeBuildValue(process.env),
    DOCKER_WEB_NATIVE_SUPPORT_BUILD: getE2EDockerNativeSupportBuildValue(
      process.env
    ),
    DOCKER_WEB_CRON_RUNNER_ENABLED: getE2EDockerCronRunnerEnabledValue({
      ...process.env,
      ...(options.env ?? {}),
    }),
    DOCKER_WEB_SUPABASE_START_EXCLUDE:
      process.env.DOCKER_WEB_SUPABASE_START_EXCLUDE ??
      process.env.E2E_SUPABASE_START_EXCLUDE ??
      'edge-runtime',
  };
  env = getFrontendE2EEnv(frontendArgs.frontend, env);
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

  const reusableLocalRedis = await resolveReusableLocalRedisRuntime({ env });

  if (reusableLocalRedis) {
    const redisEnv = {
      DOCKER_UPSTASH_REDIS_REST_TOKEN: reusableLocalRedis.token,
      DOCKER_UPSTASH_REDIS_REST_URL: reusableLocalRedis.url,
      UPSTASH_REDIS_REST_TOKEN: reusableLocalRedis.token,
      UPSTASH_REDIS_REST_URL: reusableLocalRedis.url,
    };

    env = {
      ...env,
      ...redisEnv,
      E2E_REUSED_LOCAL_REDIS: '1',
    };
    ensureLocalE2EEnvFile(envFilePath, redisEnv);
  }

  assertSafeE2EEnvironment(env);

  const reusableWebImage = await prepareReusableWebImage({ env });
  const reusableSupportImages = reusableWebImage
    ? await prepareReusableSupportImages({ env })
    : null;

  if (reusableWebImage) {
    env = {
      ...env,
      DOCKER_WEB_REUSED_WEB_IMAGE_SOURCE: reusableWebImage.source,
      DOCKER_WEB_REUSED_WEB_IMAGE_TARGETS: reusableWebImage.targets.join(','),
      DOCKER_WEB_SKIP_BLUE_GREEN_WEB_BUILD: '1',
      ...(reusableSupportImages?.complete
        ? {
            DOCKER_WEB_REUSED_SUPPORT_IMAGE_TARGETS:
              reusableSupportImages.targets.join(','),
            DOCKER_WEB_SKIP_BLUE_GREEN_SUPPORT_BUILD: '1',
          }
        : {}),
    };
  }

  let stackTouched = false;
  let runError = null;
  let tasksSatellite = null;
  const ownedSatelliteRuntimes = [];

  let playwrightEnv = env;

  try {
    const discoverTasksSatellite = shouldDiscoverTasksSatelliteFromTestList(
      frontendArgs.playwrightArgs,
      env
    );
    const discoverOwnedSatellites = shouldDiscoverOwnedSatellitesFromTestList(
      frontendArgs.playwrightArgs,
      env
    );
    let playwrightTestList = '';
    if (discoverTasksSatellite || discoverOwnedSatellites) {
      const listedTests = await runCommandForOutput(
        'bunx',
        ['playwright', 'test', '--list', ...frontendArgs.playwrightArgs],
        {
          cwd: WEB_DIR,
          env,
        }
      );
      playwrightTestList = `${listedTests.stdout}\n${listedTests.stderr}`;
    }

    const tasksSatelliteRequired = shouldStartTasksSatellite(
      frontendArgs.playwrightArgs,
      env,
      playwrightTestList
    );
    const ownedSatellites = getRequiredOwnedSatellites(
      frontendArgs.playwrightArgs,
      env,
      playwrightTestList
    );
    if (tasksSatelliteRequired) {
      await runCommand('bun', getTasksSatelliteDependencyBuildArgs(), {
        cwd: ROOT_DIR,
        env,
      });
    }
    for (const satellite of ownedSatellites) {
      await runCommand('bun', getOwnedSatelliteDependencyBuildArgs(satellite), {
        cwd: ROOT_DIR,
        env,
      });
    }

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
    for (const satellite of ownedSatellites) {
      const runtime = startOwnedSatellite(satellite, { env });
      ownedSatelliteRuntimes.push(runtime);
      await ensurePortlessRoute({
        env: getOwnedSatellitePortlessEnv(satellite, env),
      });
      await waitForOwnedSatellite(runtime, (url) =>
        waitForUrl(url, {
          timeoutMs: DEFAULT_PORTLESS_READY_TIMEOUT_MS,
        })
      );
    }
    playwrightEnv = getOwnedSatellitesPlaywrightEnv(ownedSatellites, env);
    if (tasksSatelliteRequired) {
      tasksSatellite = startTasksSatellite({ env });
      await ensurePortlessRoute({
        env: getTasksSatellitePortlessEnv(env),
      });
      await waitForTasksSatellite(tasksSatellite, (url) =>
        waitForUrl(url, {
          timeoutMs: DEFAULT_PORTLESS_READY_TIMEOUT_MS,
        })
      );
      playwrightEnv = getTasksSatellitePlaywrightEnv(playwrightEnv);
    }
    await runCommand(
      'bunx',
      ['playwright', 'test', ...frontendArgs.playwrightArgs],
      {
        cwd: WEB_DIR,
        env: playwrightEnv,
      }
    );
  } catch (error) {
    runError = error;
    await printE2EFailureDiagnostics({ env, error });
    printTasksSatelliteLog(tasksSatellite);
    for (const runtime of ownedSatelliteRuntimes) {
      printOwnedSatelliteLog(runtime);
    }
  }

  if (tasksSatellite) {
    try {
      await stopTasksSatellite(tasksSatellite);
    } catch (tasksCleanupError) {
      if (!runError) {
        runError = tasksCleanupError;
      } else {
        console.error(
          tasksCleanupError instanceof Error
            ? tasksCleanupError.message
            : tasksCleanupError
        );
      }
    }
  }

  for (const runtime of ownedSatelliteRuntimes.reverse()) {
    try {
      await stopOwnedSatellite(runtime);
    } catch (satelliteCleanupError) {
      if (!runError) {
        runError = satelliteCleanupError;
      } else {
        console.error(
          satelliteCleanupError instanceof Error
            ? satelliteCleanupError.message
            : satelliteCleanupError
        );
      }
    }
  }

  if (stackTouched && !shouldKeepStack(env)) {
    try {
      await stopDockerizedE2E({
        env,
        envFilePath,
        imageServicesToRemove: options.dockerProjectImageServicesToRemove,
        preserveImages: options.preserveDockerProjectImages === true,
      });
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
  DEFAULT_E2E_COMPARE_REPORT_PATH,
  DEFAULT_ENV_FILE,
  DEFAULT_HEALTH_URL,
  DEFAULT_PORTLESS_BASE_URL,
  DEFAULT_PORTLESS_HEALTH_URL,
  DEFAULT_PORTLESS_ALIAS_VERIFY_ATTEMPTS,
  DEFAULT_PORTLESS_ALIAS_VERIFY_DELAY_MS,
  DEFAULT_PORTLESS_PROXY_TLS_MARKER,
  DEFAULT_PORTLESS_READY_STATUS_CODES,
  DEFAULT_PORTLESS_READY_TIMEOUT_MS,
  DEFAULT_TANSTACK_PORTLESS_BASE_URL,
  DEFAULT_REUSABLE_LOCAL_REDIS_REST_PROBE_URL,
  DEFAULT_REUSABLE_LOCAL_REDIS_REST_TOKEN,
  DEFAULT_REUSABLE_LOCAL_REDIS_REST_URL,
  DEFAULT_REUSABLE_WEB_IMAGE_COLOR,
  DEFAULT_REUSABLE_WEB_IMAGE_PROJECT,
  DEFAULT_TANSTACK_DIRECT_HOST_PORT,
  DEFAULT_WEB_PROXY_HOST_PORT,
  E2E_COMPOSE_PROJECT_PREFIX,
  ensurePortlessRoute,
  ensureLocalE2EEnvFile,
  createE2ECompareReport,
  formatBlueGreenStages,
  getE2ECompareReportPath,
  getE2EPlaywrightJsonReportPath,
  getPortlessAliasVerifyAttempts,
  getPortlessAliasVerifyDelayMs,
  getE2EPortlessRouteName,
  getE2EPortlessTargetPort,
  getPortlessCommandEnv,
  getDockerComposeDiagnosticArgs,
  getE2EDockerNativeBuildValue,
  getE2EDockerNativeSupportBuildValue,
  getDockerMemoryLimit,
  getE2EComposeProjectName,
  getE2EDiagnosticLogTail,
  getE2EDockerCronRunnerEnabledValue,
  getDockerWebDownArgs,
  getDockerWebUpArgs,
  getFrontendE2EBaseUrl,
  getPortlessHealthUrl,
  getPortlessProxyStartArgs,
  getTanStackDirectHostPort,
  getFrontendE2EEnv,
  getReadinessFetchOptions,
  getDockerImageRefCandidates,
  getReusableLocalRedisRuntime,
  getReusableWebImageProject,
  getReusableWebImageRef,
  getReusableWebImageSource,
  getReusableWebImageTargets,
  getReusableHiveImageRef,
  getReusableSupportImageRef,
  getReusableSupportImageSpecs,
  getPlaywrightJsonSummary,
  getWebProxyHealthUrl,
  getWebProxyHostPort,
  isPortlessProxyConfigMismatchError,
  isPortlessProxyStartExitError,
  isPortlessNotReadyBody,
  isE2EComposeProjectName,
  isReusableLocalRedisResponse,
  isReusingLocalRedis,
  parseE2EProjectImageTags,
  parseE2EFrontendArgs,
  probeReusableLocalRedis,
  prepareReusableWebImage,
  prepareReusableSupportImages,
  printE2EFailureDiagnostics,
  readReusableWebImageColor,
  removePortlessProxyTlsMarker,
  resolveReusableWebImageSourceFromList,
  removeE2EProjectImages,
  runFrontendE2EForCompare,
  writeE2ECompareReport,
  resolveReusableLocalRedisRuntime,
  routeListHasPortlessAlias,
  runCommand,
  runCommandForOutput,
  runWebE2E,
  shouldKeepStack,
  stopDockerizedE2E,
  waitForUrl,
  withPlaywrightJsonReporterArgs,
};
