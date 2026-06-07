const { spawn } = require('node:child_process');

const NEXT_READY_PATTERNS = [
  /-\s+Environments:/u,
  /-\s+Network:/u,
  /Ready in \d/u,
];
const DEFAULT_DEV_MAX_OPEN_FILES = '65536';
const DEFAULT_WATCHPACK_POLLING = 'true';

function formatPortlessBanner(url = process.env.PORTLESS_URL) {
  return url ? `\n  Portless URL: ${url}\n` : null;
}

function shouldPrintBannerForChunk(chunk) {
  return NEXT_READY_PATTERNS.some((pattern) => pattern.test(chunk));
}

function parseCommandArgs(args = process.argv.slice(2)) {
  const separatorIndex = args.indexOf('--');
  return separatorIndex >= 0 ? args.slice(separatorIndex + 1) : args;
}

function prepareCommandForOpenFilesLimit({
  commandArgs,
  env = process.env,
  platform = process.platform,
} = {}) {
  if (!commandArgs?.length) {
    return { args: [], command: null, env };
  }

  const requestedLimit =
    env.TUTURUUU_DEV_MAX_OPEN_FILES || DEFAULT_DEV_MAX_OPEN_FILES;

  if (platform === 'win32' || requestedLimit === '0') {
    return {
      args: commandArgs.slice(1),
      command: commandArgs[0],
      env,
    };
  }

  return {
    args: [
      '-c',
      'ulimit -n "$TUTURUUU_DEV_MAX_OPEN_FILES" 2>/dev/null || true; exec "$@"',
      'tuturuuu-dev-command',
      ...commandArgs,
    ],
    command: '/bin/sh',
    env: {
      ...env,
      TUTURUUU_DEV_MAX_OPEN_FILES: requestedLimit,
      WATCHPACK_POLLING: env.WATCHPACK_POLLING || DEFAULT_WATCHPACK_POLLING,
    },
  };
}

function runPortlessDevBanner({
  args = process.argv.slice(2),
  env = process.env,
  stderr = process.stderr,
  stdin = process.stdin,
  stdout = process.stdout,
  spawnImpl = spawn,
  setTimer = setTimeout,
} = {}) {
  const commandArgs = parseCommandArgs(args);

  if (commandArgs.length === 0) {
    stderr.write(
      'Usage: node scripts/portless-dev-banner.js -- <command> [args...]\n'
    );
    return 1;
  }

  const preparedCommand = prepareCommandForOpenFilesLimit({
    commandArgs,
    env,
  });

  let bannerPrinted = false;
  const banner = formatPortlessBanner(env.PORTLESS_URL);
  const printBanner = () => {
    if (!banner || bannerPrinted) {
      return;
    }

    stdout.write(banner);
    bannerPrinted = true;
  };

  const child = spawnImpl(preparedCommand.command, preparedCommand.args, {
    env: preparedCommand.env,
    stdio: [stdin, 'pipe', 'pipe'],
  });

  const maybePrintBanner = (data, output) => {
    const chunk = data.toString();
    output.write(data);

    if (shouldPrintBannerForChunk(chunk)) {
      printBanner();
    }
  };

  child.stdout?.on('data', (data) => maybePrintBanner(data, stdout));
  child.stderr?.on('data', (data) => maybePrintBanner(data, stderr));

  const fallbackTimer = setTimer(printBanner, 1500);
  fallbackTimer?.unref?.();

  const forwardSignal = (signal) => {
    child.kill(signal);
  };

  process.once('SIGINT', forwardSignal);
  process.once('SIGTERM', forwardSignal);

  child.on('exit', (code, signal) => {
    process.removeListener('SIGINT', forwardSignal);
    process.removeListener('SIGTERM', forwardSignal);

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode = code ?? 1;
  });

  child.on('error', (error) => {
    stderr.write(`Failed to start dev command: ${error.message}\n`);
    process.exitCode = 1;
  });

  return 0;
}

if (require.main === module) {
  const exitCode = runPortlessDevBanner();
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

module.exports = {
  DEFAULT_DEV_MAX_OPEN_FILES,
  DEFAULT_WATCHPACK_POLLING,
  formatPortlessBanner,
  parseCommandArgs,
  prepareCommandForOpenFilesLimit,
  runPortlessDevBanner,
  shouldPrintBannerForChunk,
};
