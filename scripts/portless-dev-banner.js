const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const NEXT_READY_PATTERNS = [
  /-\s+Environments:/u,
  /-\s+Network:/u,
  /Ready in \d/u,
];
const DEFAULT_DEV_MAX_OPEN_FILES = '65536';
const DEV_ENV_FILE_ORDER = [
  '.env',
  '.env.development',
  '.env.local',
  '.env.development.local',
];

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

function stripUnquotedInlineComment(value) {
  const quote = value[0];

  if (quote === '"' || quote === "'") {
    const closingQuoteIndex = value.lastIndexOf(quote);
    return closingQuoteIndex > 0
      ? value.slice(0, closingQuoteIndex + 1)
      : value;
  }

  return value.replace(/\s+#.*$/u, '').trimEnd();
}

function parseEnvFile(envFilePath, fsImpl = fs) {
  if (!fsImpl.existsSync(envFilePath)) {
    return {};
  }

  const values = {};
  const content = fsImpl.readFileSync(envFilePath, 'utf8');

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripUnquotedInlineComment(
      line.slice(separatorIndex + 1).trim()
    );
    values[key] = value.replace(/^(['"])(.*)\1$/u, '$2');
  }

  return values;
}

function getSharedLocalEnvFilePaths({
  cwd = process.cwd(),
  rootDir = ROOT_DIR,
}) {
  const appDir = path.resolve(cwd);
  const rootEnvFile = path.join(rootDir, '.env.local');
  const appEnvFiles = DEV_ENV_FILE_ORDER.map((fileName) =>
    path.join(appDir, fileName)
  );

  return [rootEnvFile, ...appEnvFiles].filter(
    (envFilePath, index, paths) => paths.indexOf(envFilePath) === index
  );
}

function loadSharedLocalEnvDefaults({
  cwd = process.cwd(),
  env = process.env,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const fileEnv = {};

  for (const envFilePath of getSharedLocalEnvFilePaths({ cwd, rootDir })) {
    Object.assign(fileEnv, parseEnvFile(envFilePath, fsImpl));
  }

  return {
    ...fileEnv,
    ...env,
  };
}

function shouldLoadSharedLocalEnv(commandArgs) {
  return commandArgs[0] === 'next' && commandArgs[1] === 'dev';
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
    },
  };
}

function runPortlessDevBanner({
  args = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  fsImpl = fs,
  rootDir = ROOT_DIR,
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

  const commandEnv = shouldLoadSharedLocalEnv(commandArgs)
    ? loadSharedLocalEnvDefaults({ cwd, env, fsImpl, rootDir })
    : env;
  const preparedCommand = prepareCommandForOpenFilesLimit({
    commandArgs,
    env: commandEnv,
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
  DEV_ENV_FILE_ORDER,
  formatPortlessBanner,
  getSharedLocalEnvFilePaths,
  loadSharedLocalEnvDefaults,
  parseCommandArgs,
  parseEnvFile,
  prepareCommandForOpenFilesLimit,
  runPortlessDevBanner,
  shouldLoadSharedLocalEnv,
  shouldPrintBannerForChunk,
  stripUnquotedInlineComment,
};
