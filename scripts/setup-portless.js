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
  log(`Usage: bun portless:setup [-- --service|--check|--dry-run]

Starts the Portless HTTPS proxy before Turbo launches app dev scripts.

Options:
  --check       Only check whether the proxy is responding on port 443
  --dry-run     Print the Portless command that would be run
  --service     Install the Portless OS startup service instead of starting
                the current proxy daemon

Environment:
  SKIP_PORTLESS_SETUP=1 or PORTLESS_SETUP=0 skips setup
`);
}

function getSetupArgs(args) {
  return args.includes('--service')
    ? ['service', 'install']
    : ['proxy', 'start'];
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
  getSetupArgs,
  parsePortlessProxyReady,
  resolvePortlessBin,
  runPortlessSetup,
  shouldSkipPortlessSetup,
};
