const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { safeFailureSuffix } = require('./secret-safe-diagnostics.js');

const WORKFLOW_REF =
  'tutur3u/platform/.github/workflows/mail-e2e-report-only.yaml@refs/heads/main';
const ADMISSION_ERROR =
  'Mail E2E report-only runner is limited to the trusted main workflow';
const MAIL_PORT = 7820;
const MAIL_URL = `http://127.0.0.1:${MAIL_PORT}`;
const REPORT_RELATIVE_PATH = 'test-results/mail-e2e-results.json';
const SERVER_READY_TIMEOUT_MS = 60_000;
const SERVER_POLL_INTERVAL_MS = 500;

function isNumeric(value) {
  return typeof value === 'string' && /^[0-9]+$/u.test(value);
}

function assertMailE2EAdmission(env = process.env) {
  if (
    env.CI !== 'true' ||
    env.GITHUB_REPOSITORY !== 'tutur3u/platform' ||
    env.GITHUB_WORKFLOW_REF !== WORKFLOW_REF ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    env.RUNNER_OS !== 'Linux' ||
    !['push', 'schedule', 'workflow_dispatch'].includes(
      env.GITHUB_EVENT_NAME
    ) ||
    !isNumeric(env.GITHUB_RUN_ID) ||
    !isNumeric(env.GITHUB_RUN_ATTEMPT)
  ) {
    throw new Error(ADMISSION_ERROR);
  }
}

function parseSupabaseEnv(rawOutput) {
  const parsed = {};
  for (const line of String(rawOutput ?? '').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[match[1]] = value;
  }
  const supabaseUrl = parsed.API_URL;
  const publishableKey = parsed.PUBLISHABLE_KEY || parsed.ANON_KEY;
  const secretKey = parsed.SECRET_KEY || parsed.SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publishableKey || !secretKey) {
    throw new Error(
      'Missing API_URL, PUBLISHABLE_KEY/ANON_KEY, or SECRET_KEY/SERVICE_ROLE_KEY from supabase status -o env'
    );
  }
  return { supabaseUrl, publishableKey, secretKey };
}

function buildMailRuntimeEnv(baseEnv, sb) {
  return {
    ...baseEnv,
    CI: 'true',
    MAIL_DEPLOYMENT_PROFILE: 'development',
    MAIL_E2E_BASE_URL: MAIL_URL,
    MAIL_E2E_SKIP_WEB_SERVER: '1',
    MAIL_APP_URL: MAIL_URL,
    NEXT_PUBLIC_APP_URL: MAIL_URL,
    NEXT_PUBLIC_MAIL_APP_URL: MAIL_URL,
    NEXT_PUBLIC_SUPABASE_URL: sb.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sb.publishableKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: sb.publishableKey,
    NEXT_PUBLIC_WEB_APP_URL:
      baseEnv.NEXT_PUBLIC_WEB_APP_URL || 'http://127.0.0.1:7803',
    SUPABASE_URL: sb.supabaseUrl,
    SUPABASE_SERVER_URL: sb.supabaseUrl,
    SUPABASE_SECRET_KEY: sb.secretKey,
    SUPABASE_SERVICE_ROLE_KEY: sb.secretKey,
    DOCKER_INTERNAL_SUPABASE_URL: sb.supabaseUrl,
    WEB_APP_URL: baseEnv.WEB_APP_URL || 'http://127.0.0.1:7803',
    TUTURUUU_APP_COORDINATION_SECRET:
      baseEnv.TUTURUUU_APP_COORDINATION_SECRET ||
      'local-e2e-app-coordination-secret',
    PORT: String(MAIL_PORT),
    PLAYWRIGHT_JSON_OUTPUT_NAME: REPORT_RELATIVE_PATH,
  };
}

function playwrightArgs() {
  return [
    '--cwd',
    'apps/mail',
    'x',
    '--no-install',
    'playwright',
    'test',
    '--reporter=line,html,json',
    '--trace=retain-on-failure',
    '--retries=0',
    '--global-timeout=330000',
  ];
}

function summarizeReport(reportPath) {
  if (!fs.existsSync(reportPath)) {
    return { ok: false, total: 0, failed: 0, summary: 'missing JSON report' };
  }
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {
    return {
      ok: false,
      total: 0,
      failed: 0,
      summary: 'unreadable JSON report',
    };
  }
  let total = 0;
  let failed = 0;
  const walk = (suites) => {
    if (!Array.isArray(suites)) return;
    for (const suite of suites) {
      if (Array.isArray(suite?.specs)) {
        for (const spec of suite.specs) {
          const tests = Array.isArray(spec?.tests) ? spec.tests : [];
          for (const testCase of tests) {
            total += 1;
            const passed =
              testCase?.status === 'expected' ||
              (testCase?.status === undefined && spec?.ok === true);
            if (!passed) failed += 1;
          }
        }
      }
      walk(suite?.suites);
    }
  };
  walk(report?.suites);
  return {
    ok: total > 0 && failed === 0,
    total,
    failed,
    summary: `total=${total} passed=${total - failed} failed=${failed}`,
  };
}

function runSync(root, executable, args, env, capture = false) {
  return execFileSync(executable, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    timeout: 600_000,
  });
}

async function waitForServer(url, child, timeoutMs = SERVER_READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Mail server exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {
      // Server still starting.
    }
    await new Promise((resolve) =>
      setTimeout(resolve, SERVER_POLL_INTERVAL_MS)
    );
  }
  throw new Error(`Mail server did not become ready at ${url} in time`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  try {
    child.kill('SIGTERM');
  } catch {
    return;
  }
  const deadline = Date.now() + 5_000;
  while (child.exitCode === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (child.exitCode === null) {
    try {
      child.kill('SIGKILL');
    } catch {
      // Ignore already exited child.
    }
  }
}

async function runSuite(root, baseEnv) {
  runSync(root, 'bun', ['sb:start'], baseEnv);
  const statusOutput = runSync(
    root,
    'node',
    ['apps/database/scripts/run-supabase.js', 'status', '-o', 'env'],
    baseEnv,
    true
  );
  const sb = parseSupabaseEnv(statusOutput);
  const runtimeEnv = buildMailRuntimeEnv(baseEnv, sb);

  const reportPath = path.join(root, 'apps/mail', REPORT_RELATIVE_PATH);
  fs.rmSync(reportPath, { force: true });

  runSync(
    root,
    'bun',
    ['--filter', '@tuturuuu/mail', 'build:legacy'],
    runtimeEnv
  );

  const server = spawn('bun', ['--cwd', 'apps/mail', 'run', 'start:legacy'], {
    cwd: root,
    env: runtimeEnv,
    stdio: 'inherit',
  });

  try {
    await waitForServer(MAIL_URL, server);
    runSync(root, 'bun', playwrightArgs(), runtimeEnv);
  } finally {
    await stopChild(server);
  }

  const verdict = summarizeReport(reportPath);
  console.log(`Mail E2E report-only summary: ${verdict.summary}`);
  if (!verdict.ok) {
    throw new Error(`Mail E2E report-only failures: ${verdict.summary}`);
  }
}

async function main() {
  let phase = 'admission';
  try {
    assertMailE2EAdmission(process.env);
    const root = process.env.GITHUB_WORKSPACE;
    if (!root) throw new Error('Missing GITHUB_WORKSPACE');
    phase = 'checkout validation';
    if (fs.realpathSync(process.cwd()) !== fs.realpathSync(root)) {
      throw new Error('Run from the workflow checkout');
    }
    const mode = process.argv[2];
    if (mode === 'cleanup') {
      phase = 'cleanup';
      runSync(root, 'bun', ['sb:stop'], process.env);
      return;
    }
    if (mode !== 'run') {
      throw new Error('Expected run or cleanup');
    }
    phase = 'test run';
    await runSuite(root, process.env);
  } catch (error) {
    console.error(
      phase === 'admission' && error?.message === ADMISSION_ERROR
        ? ADMISSION_ERROR
        : `Mail E2E ${phase} failed${safeFailureSuffix(error)}.`
    );
    process.exitCode = 1;
  }
}

if (require.main === module) void main();

module.exports = {
  ADMISSION_ERROR,
  MAIL_PORT,
  MAIL_URL,
  REPORT_RELATIVE_PATH,
  WORKFLOW_REF,
  assertMailE2EAdmission,
  buildMailRuntimeEnv,
  parseSupabaseEnv,
  playwrightArgs,
  summarizeReport,
};
