#!/usr/bin/env node

// run-tanstack-e2e-docker.js
//
// Purpose
// -------
// Orchestrate a full local/CI E2E run of the NEW dual-stack migration target
// (apps/tanstack-web TanStack Start frontend + apps/backend Rust service) using
// the self-contained `docker-compose.tanstack-dual.yml` stack. This runner:
//
//   1. Brings up the two-service stack:
//        docker compose -f <file> up -d --build   (respect --no-build)
//   2. Waits for both containers (`backend-dual` and `tanstack-web-dual`) to
//      report a healthy Docker healthcheck status (polling `docker inspect`).
//   3. Runs the apps/tanstack-web Playwright E2E suite against the live stack,
//      pointing Playwright's base URL at the published tanstack-web port.
//   4. Always tears the stack down (`docker compose -f <file> down`) unless
//      --keep-up is passed, even when a previous step fails (try/finally).
//
// This is the minimal "is the shipped dual-stack artifact green?" gate. For the
// full operations + verification narrative (services, ports, gate checklist),
// see apps/docs/build/devops/tanstack-rust-cutover-runbook.mdx.
//
// Usage
// -----
//   node scripts/run-tanstack-e2e-docker.js [options] [-- <playwright args>]
//
// Options:
//   --no-build              Skip rebuilding images (omit `--build` from `up`).
//   --keep-up               Leave the stack running (skip teardown).
//   --base-url <url>        Override the Playwright base URL. Defaults to the
//                           published tanstack-web port (TANSTACK_WEB_PORT).
//   --compose-file <path>   Compose file to use.
//                           Default: docker-compose.tanstack-dual.yml
//   -h, --help              Print this help and exit.
//
// Everything after a literal `--` is forwarded verbatim to `bunx playwright
// test` in apps/tanstack-web.
//
// No secrets are embedded; environment values are referenced by name only.

const {
  execFile: nodeExecFile,
  spawn: nodeSpawn,
} = require('node:child_process');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TANSTACK_WEB_DIR = path.join(ROOT_DIR, 'apps', 'tanstack-web');

const DEFAULT_COMPOSE_FILE = 'docker-compose.tanstack-dual.yml';
const BACKEND_CONTAINER = 'backend-dual';
const TANSTACK_WEB_CONTAINER = 'tanstack-web-dual';
const HEALTH_CONTAINERS = Object.freeze([
  BACKEND_CONTAINER,
  TANSTACK_WEB_CONTAINER,
]);

const DEFAULT_BACKEND_PORT = '7820';
const DEFAULT_TANSTACK_WEB_PORT = '7824';

const DEFAULT_HEALTH_TIMEOUT_MS = 300_000;
const DEFAULT_HEALTH_INTERVAL_MS = 3_000;

const HELP_TEXT = `Usage: node scripts/run-tanstack-e2e-docker.js [options] [-- <playwright args>]

Brings up the dual-stack (apps/tanstack-web + apps/backend) via
docker-compose.tanstack-dual.yml, waits for both services healthy, runs the
apps/tanstack-web Playwright E2E suite against it, then tears the stack down.

Options:
  --no-build            Skip rebuilding images (omit --build from up).
  --keep-up             Leave the stack running (skip teardown).
  --base-url <url>      Override the Playwright base URL.
  --compose-file <path> Compose file (default: ${DEFAULT_COMPOSE_FILE}).
  -h, --help            Print this help and exit.

See apps/docs/build/devops/tanstack-rust-cutover-runbook.mdx for the full
operations + verification narrative.
`;

function parseArgs(argv = []) {
  const options = {
    baseUrl: null,
    build: true,
    composeFile: DEFAULT_COMPOSE_FILE,
    help: false,
    keepUp: false,
    playwrightArgs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      options.playwrightArgs = argv.slice(index + 1);
      break;
    }

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--no-build') {
      options.build = false;
      continue;
    }

    if (arg === '--keep-up') {
      options.keepUp = true;
      continue;
    }

    if (arg === '--base-url') {
      options.baseUrl = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    const baseUrlMatch = arg.match(/^--base-url=(.*)$/u);
    if (baseUrlMatch) {
      options.baseUrl = baseUrlMatch[1];
      continue;
    }

    if (arg === '--compose-file') {
      options.composeFile = argv[index + 1] ?? options.composeFile;
      index += 1;
      continue;
    }

    const composeFileMatch = arg.match(/^--compose-file=(.*)$/u);
    if (composeFileMatch) {
      options.composeFile = composeFileMatch[1];
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function getTanStackWebPort(env = process.env) {
  const value = String(env.TANSTACK_WEB_PORT ?? '').trim();

  return /^\d+$/u.test(value) && Number.parseInt(value, 10) > 0
    ? value
    : DEFAULT_TANSTACK_WEB_PORT;
}

function getBackendPort(env = process.env) {
  const value = String(env.BACKEND_PORT ?? '').trim();

  return /^\d+$/u.test(value) && Number.parseInt(value, 10) > 0
    ? value
    : DEFAULT_BACKEND_PORT;
}

function resolveBaseUrl(options, env = process.env) {
  const explicit =
    typeof options.baseUrl === 'string' ? options.baseUrl.trim() : '';

  if (explicit) {
    return explicit;
  }

  const fromEnv =
    typeof env.TANSTACK_WEB_E2E_BASE_URL === 'string'
      ? env.TANSTACK_WEB_E2E_BASE_URL.trim()
      : '';

  if (fromEnv) {
    return fromEnv;
  }

  return `http://127.0.0.1:${getTanStackWebPort(env)}`;
}

function getComposeUpArgs(options) {
  const args = ['compose', '-f', options.composeFile, 'up', '-d'];

  if (options.build) {
    args.push('--build');
  }

  return args;
}

function getComposeDownArgs(options) {
  return ['compose', '-f', options.composeFile, 'down'];
}

function getHealthInspectArgs(container) {
  return [
    'inspect',
    '--format',
    '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
    container,
  ];
}

function getPlaywrightArgs(options) {
  return ['playwright', 'test', ...options.playwrightArgs];
}

// Build a fully-resolved, side-effect-free description of every command this
// runner intends to execute. Pure so tests can assert the plan without running
// docker or Playwright.
function buildCommandPlan(options, env = process.env) {
  const baseUrl = resolveBaseUrl(options, env);

  return {
    baseUrl,
    healthChecks: HEALTH_CONTAINERS.map((container) => ({
      args: getHealthInspectArgs(container),
      command: 'docker',
      container,
    })),
    playwright: {
      args: getPlaywrightArgs(options),
      command: 'bunx',
      cwd: TANSTACK_WEB_DIR,
      env: {
        BASE_URL: baseUrl,
        TANSTACK_WEB_E2E_BASE_URL: baseUrl,
      },
    },
    teardown: options.keepUp
      ? null
      : {
          args: getComposeDownArgs(options),
          command: 'docker',
        },
    up: {
      args: getComposeUpArgs(options),
      command: 'docker',
    },
  };
}

function execFileForOutput(
  command,
  args,
  options = {},
  execFileImpl = nodeExecFile
) {
  return new Promise((resolve, reject) => {
    execFileImpl(
      command,
      args,
      {
        cwd: options.cwd ?? ROOT_DIR,
        env: options.env ?? process.env,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ stderr: String(stderr ?? ''), stdout: String(stdout ?? '') });
      }
    );
  });
}

function spawnCommand(command, args, options = {}, spawnImpl = nodeSpawn) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
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

function isHealthyStatus(status) {
  return (
    String(status ?? '')
      .trim()
      .toLowerCase() === 'healthy'
  );
}

async function waitForContainersHealthy(plan, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_HEALTH_INTERVAL_MS;
  const env = options.env ?? process.env;
  const execFileImpl = options.execFile ?? nodeExecFile;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const output = options.output ?? process.stderr;
  const deadline = Date.now() + timeoutMs;

  const pending = new Map(
    plan.healthChecks.map((check) => [check.container, check])
  );
  let lastError = null;

  while (Date.now() < deadline) {
    for (const [container, check] of [...pending.entries()]) {
      try {
        const { stdout } = await execFileForOutput(
          check.command,
          check.args,
          { env },
          execFileImpl
        );
        const status = stdout.trim();

        if (isHealthyStatus(status)) {
          output.write(`[tanstack-e2e] ${container} is healthy.\n`);
          pending.delete(container);
        } else {
          lastError = new Error(
            `${container} health status is "${status || 'unknown'}"`
          );
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (pending.size === 0) {
      return;
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out waiting for ${[...pending.keys()].join(', ')} to become healthy: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function runTanStackE2EDocker(argv = process.argv.slice(2), deps = {}) {
  const env = deps.env ?? process.env;
  const output = deps.output ?? process.stderr;
  const execFileImpl = deps.execFile ?? nodeExecFile;
  const spawnImpl = deps.spawn ?? nodeSpawn;
  const run =
    deps.run ??
    ((command, args, runOptions) =>
      spawnCommand(command, args, runOptions, spawnImpl));

  const options = parseArgs(argv);

  if (options.help) {
    output.write(HELP_TEXT);
    return;
  }

  const plan = buildCommandPlan(options, env);

  let stackTouched = false;
  let runError = null;

  try {
    stackTouched = true;
    output.write(
      `[tanstack-e2e] $ ${plan.up.command} ${plan.up.args.join(' ')}\n`
    );
    await run(plan.up.command, plan.up.args, { cwd: ROOT_DIR, env });

    await waitForContainersHealthy(plan, {
      env,
      execFile: execFileImpl,
      output,
    });

    output.write(`[tanstack-e2e] Running Playwright against ${plan.baseUrl}\n`);
    await run(plan.playwright.command, plan.playwright.args, {
      cwd: plan.playwright.cwd,
      env: { ...env, ...plan.playwright.env },
    });
  } catch (error) {
    runError = error;
  }

  if (stackTouched && plan.teardown) {
    try {
      output.write(
        `[tanstack-e2e] $ ${plan.teardown.command} ${plan.teardown.args.join(
          ' '
        )}\n`
      );
      await run(plan.teardown.command, plan.teardown.args, {
        cwd: ROOT_DIR,
        env,
      });
    } catch (cleanupError) {
      if (runError) {
        output.write(
          `[tanstack-e2e] Teardown failed: ${
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError)
          }\n`
        );
      } else {
        runError = cleanupError;
      }
    }
  }

  if (runError) {
    throw runError;
  }
}

async function main() {
  try {
    await runTanStackE2EDocker();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  BACKEND_CONTAINER,
  DEFAULT_BACKEND_PORT,
  DEFAULT_COMPOSE_FILE,
  DEFAULT_HEALTH_INTERVAL_MS,
  DEFAULT_HEALTH_TIMEOUT_MS,
  DEFAULT_TANSTACK_WEB_PORT,
  HEALTH_CONTAINERS,
  HELP_TEXT,
  TANSTACK_WEB_CONTAINER,
  buildCommandPlan,
  execFileForOutput,
  getBackendPort,
  getComposeDownArgs,
  getComposeUpArgs,
  getHealthInspectArgs,
  getPlaywrightArgs,
  getTanStackWebPort,
  isHealthyStatus,
  parseArgs,
  resolveBaseUrl,
  runTanStackE2EDocker,
  spawnCommand,
  waitForContainersHealthy,
};
