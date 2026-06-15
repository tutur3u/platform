const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function resolvePortlessBin(root = repoRoot, platform = process.platform) {
  const executable = platform === 'win32' ? 'portless.cmd' : 'portless';
  const localBin = path.join(root, 'node_modules', '.bin', executable);

  return fs.existsSync(localBin) ? localBin : 'portless';
}

function parsePortlessProxyReady(output) {
  return /Proxy on 443:\s+responding/iu.test(output);
}

function shouldSkipPortlessSetup(
  env = process.env,
  isTTY = process.stdin.isTTY
) {
  return (
    env.CI === 'true' ||
    env.SKIP_PORTLESS_SETUP === '1' ||
    env.PORTLESS_SETUP === '0' ||
    !isTTY
  );
}

function createRunner() {
  return (command, args, { capture = false } = {}) =>
    spawnSync(command, args, {
      encoding: 'utf8',
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
}

function printHelp(log = console.log) {
  log(`Usage: bun portless:setup [-- --service|--check|--dry-run|--reset]

Starts the Portless HTTPS proxy before Turbo launches app dev scripts.

Options:
  --check       Only check whether the proxy is responding on port 443
  --dry-run     Print the Portless command(s) that would be run
  --service     Install the Portless OS startup service instead of starting
                the current proxy daemon
  --reset       Force a clean restart (stop -> prune -> start) even when a
                proxy is already running. Use this to recover from a stale
                routing table (routes pointing at dead dev-server ports).

Environment:
  SKIP_PORTLESS_SETUP=1 or PORTLESS_SETUP=0 skips setup
`);
}

function getSetupArgs(args) {
  return args.includes('--service')
    ? ['service', 'install']
    : ['proxy', 'start'];
}

// A clean recovery: stop the (possibly stale) proxy, kill orphaned dev servers
// from crashed sessions, then start a fresh proxy that apps re-register against.
// `proxy stop` and `prune` are best-effort; only the final `proxy start`
// decides success.
function getResetSteps() {
  return [['proxy', 'stop'], ['prune'], ['proxy', 'start']];
}

function resetPortlessProxy({ args, portlessBin, runner, log, env, isTTY }) {
  const steps = getResetSteps();

  if (args.includes('--dry-run')) {
    for (const step of steps) {
      log(`${portlessBin} ${step.join(' ')}`);
    }
    return 0;
  }

  if (shouldSkipPortlessSetup(env, isTTY)) {
    log(
      'Skipping Portless reset because this shell is non-interactive or setup was disabled.'
    );
    log('Run `bun portless:reset` from a terminal to recover the proxy.');
    return 0;
  }

  log('Resetting Portless proxy (stop -> prune -> start)...');
  log('This may ask for sudo so Portless can rebind HTTPS on port 443.');

  let startStatus = 0;
  for (const step of steps) {
    const result = runner(portlessBin, step, { capture: false });
    if (step[0] === 'proxy' && step[1] === 'start') {
      startStatus = result.status ?? 1;
    }
  }

  log(
    'Restart your dev servers (e.g. `bun dev:inventory`) so each app re-registers its route.'
  );

  return startStatus;
}

function runPortlessSetup({
  args = process.argv.slice(2),
  env = process.env,
  isTTY = process.stdin.isTTY,
  log = console.log,
  error = console.error,
  runner = createRunner(),
} = {}) {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp(log);
    return 0;
  }

  const portlessBin = resolvePortlessBin();

  if (args.includes('--reset')) {
    return resetPortlessProxy({ args, env, isTTY, log, portlessBin, runner });
  }

  const status = runner(portlessBin, ['service', 'status'], {
    capture: true,
  });
  const statusOutput = `${status.stdout ?? ''}${status.stderr ?? ''}`;

  if (parsePortlessProxyReady(statusOutput)) {
    log('Portless proxy is already responding on port 443.');
    return 0;
  }

  if (args.includes('--check')) {
    error('Portless proxy is not responding on port 443.');
    return 1;
  }

  const setupArgs = getSetupArgs(args);

  if (args.includes('--dry-run')) {
    log(`${portlessBin} ${setupArgs.join(' ')}`);
    return 0;
  }

  if (shouldSkipPortlessSetup(env, isTTY)) {
    log(
      'Skipping Portless setup because this shell is non-interactive or setup was disabled.'
    );
    log('Run `bun portless:setup` from a terminal before `bun dev:*`.');
    return 0;
  }

  log('Starting Portless before Turbo launches app dev scripts...');
  log('This may ask for sudo so Portless can bind HTTPS on port 443.');

  const result = runner(portlessBin, setupArgs, { capture: false });

  return result.status ?? 1;
}

if (require.main === module) {
  process.exitCode = runPortlessSetup();
}

module.exports = {
  getResetSteps,
  getSetupArgs,
  parsePortlessProxyReady,
  resetPortlessProxy,
  resolvePortlessBin,
  runPortlessSetup,
  shouldSkipPortlessSetup,
};
