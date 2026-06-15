#!/usr/bin/env node
// Configure apps/web for the local Redis HTTP bridge and optionally start it.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_WEB_ENV_FILE = path.join('apps', 'web', '.env.local');
const DEFAULT_REDIS_URL = 'http://localhost:8079';
const DEFAULT_REDIS_TOKEN = 'example_token';

function resolveInsideRoot(rootDir, maybeRelativePath) {
  return path.isAbsolute(maybeRelativePath)
    ? maybeRelativePath
    : path.join(rootDir, maybeRelativePath);
}

function toRelative(rootDir, filePath) {
  return path.relative(rootDir, filePath) || path.basename(filePath);
}

function serializeEnvValue(value) {
  const raw = String(value ?? '');

  if (/^[A-Za-z0-9_./:@-]+$/u.test(raw)) {
    return raw;
  }

  return JSON.stringify(raw);
}

function updateEnvContent(content, updates) {
  const lines = String(content ?? '').split(/\r?\n/u);
  const seen = new Set();
  const updated = lines.map((line) => {
    const match = line.match(
      /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=.*$/u
    );

    if (!match) {
      return line;
    }

    const [, prefix, key] = match;
    if (!Object.hasOwn(updates, key)) {
      return line;
    }

    seen.add(key);
    return `${prefix}${key}=${serializeEnvValue(updates[key])}`;
  });

  while (updated.at(-1) === '') {
    updated.pop();
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      updated.push(`${key}=${serializeEnvValue(value)}`);
    }
  }

  return `${updated.join('\n')}\n`;
}

function defaultRunner(command, args, options) {
  return spawnSync(command, args, {
    cwd: options?.cwd,
    encoding: 'utf8',
    stdio: options?.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

function setupRedis({
  dryRun = false,
  envFilePath = DEFAULT_WEB_ENV_FILE,
  fsImpl = fs,
  redisToken = DEFAULT_REDIS_TOKEN,
  redisUrl = DEFAULT_REDIS_URL,
  rootDir = ROOT_DIR,
  runner = defaultRunner,
  start = true,
} = {}) {
  const resolvedEnvFilePath = resolveInsideRoot(rootDir, envFilePath);
  const existing = fsImpl.existsSync(resolvedEnvFilePath)
    ? fsImpl.readFileSync(resolvedEnvFilePath, 'utf8')
    : '';
  const updates = {
    UPSTASH_REDIS_REST_TOKEN: redisToken,
    UPSTASH_REDIS_REST_URL: redisUrl,
  };
  const nextContent = updateEnvContent(existing, updates);
  const changed = nextContent !== existing;

  if (!dryRun) {
    fsImpl.mkdirSync(path.dirname(resolvedEnvFilePath), { recursive: true });
    fsImpl.writeFileSync(resolvedEnvFilePath, nextContent);
  }

  let startResult = null;
  if (start && !dryRun) {
    startResult = runner('bun', ['redis:start'], {
      capture: false,
      cwd: rootDir,
    });
  }

  return {
    changed,
    dryRun,
    envFile: toRelative(rootDir, resolvedEnvFilePath),
    redisUrl,
    start,
    startExitCode: startResult?.status ?? null,
  };
}

function resetRedis({
  dryRun = false,
  envFilePath = DEFAULT_WEB_ENV_FILE,
  fsImpl = fs,
  redisToken = DEFAULT_REDIS_TOKEN,
  redisUrl = DEFAULT_REDIS_URL,
  rootDir = ROOT_DIR,
  runner = defaultRunner,
  start = true,
} = {}) {
  const setupResult = setupRedis({
    dryRun,
    envFilePath,
    fsImpl,
    redisToken,
    redisUrl,
    rootDir,
    runner,
    start,
  });

  if (setupResult.startExitCode && setupResult.startExitCode !== 0) {
    return {
      ...setupResult,
      flushExitCode: null,
      reset: true,
    };
  }

  let flushResult = null;
  if (!dryRun) {
    flushResult = runner(
      'docker',
      ['compose', 'exec', '-T', 'redis', 'redis-cli', 'FLUSHALL'],
      {
        capture: true,
        cwd: path.join(rootDir, 'apps', 'redis'),
      }
    );
  }

  return {
    ...setupResult,
    flushExitCode: flushResult?.status ?? null,
    flushOutput: [flushResult?.stdout, flushResult?.stderr]
      .filter(Boolean)
      .join('\n')
      .trim(),
    reset: true,
  };
}

function usage() {
  return `Usage: bun redis:setup [--dry-run] [--no-start] [--reset] [--url <url>] [--token <token>] [--env-file <path>]

Configure apps/web for the local Redis HTTP bridge.

Options:
  --dry-run          Show what would change without writing or starting Redis.
  --no-start         Update apps/web env only; do not run bun redis:start.
  --reset            Flush the local Redis database after setup.
  --url <url>        Redis HTTP bridge URL. Defaults to http://localhost:8079.
  --token <token>    Redis HTTP bridge token. Defaults to example_token.
  --env-file <path>  Web env file to update. Defaults to apps/web/.env.local.
`;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    envFilePath: DEFAULT_WEB_ENV_FILE,
    redisToken: DEFAULT_REDIS_TOKEN,
    redisUrl: DEFAULT_REDIS_URL,
    reset: false,
    start: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--no-start') {
      options.start = false;
      continue;
    }
    if (arg === '--reset') {
      options.reset = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--url') {
      options.redisUrl = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--url=')) {
      options.redisUrl = arg.slice('--url='.length);
      continue;
    }
    if (arg === '--token') {
      options.redisToken = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--token=')) {
      options.redisToken = arg.slice('--token='.length);
      continue;
    }
    if (arg === '--env-file') {
      options.envFilePath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--env-file=')) {
      options.envFilePath = arg.slice('--env-file='.length);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.redisUrl) {
    throw new Error('Missing value for --url');
  }
  if (!options.redisToken) {
    throw new Error('Missing value for --token');
  }
  if (!options.envFilePath) {
    throw new Error('Missing value for --env-file');
  }

  return options;
}

function formatSetupResult(result) {
  const lines = [
    `${result.dryRun ? 'Would update' : result.changed ? 'Updated' : 'Checked'} ${result.envFile} for local Redis.`,
    `- UPSTASH_REDIS_REST_URL=${result.redisUrl}`,
    '- UPSTASH_REDIS_REST_TOKEN=<redacted>',
  ];

  if (result.dryRun) {
    lines.push('- Redis stack not started in dry-run mode.');
  } else if (result.start) {
    lines.push(
      result.startExitCode === 0
        ? '- Started Redis with `bun redis:start`.'
        : `- Redis start exited with code ${result.startExitCode}.`
    );
  } else {
    lines.push('- Redis stack not started because --no-start was passed.');
  }

  lines.push('Restart `bun dev:web` so apps/web picks up the env changes.');

  return `${lines.join('\n')}\n`;
}

function formatResetResult(result) {
  const lines = [formatSetupResult(result).trimEnd()];

  if (result.dryRun) {
    lines.push(
      '- Would flush Redis database with `docker compose exec -T redis redis-cli FLUSHALL`.'
    );
  } else if (result.flushExitCode === 0) {
    lines.push('- Flushed local Redis database with `FLUSHALL`.');
  } else if (result.flushExitCode == null) {
    lines.push(
      '- Redis database was not flushed because setup/start did not complete.'
    );
  } else {
    lines.push(
      `- Redis database flush exited with code ${result.flushExitCode}.`
    );
  }

  return `${lines.join('\n')}\n`;
}

function runCli({
  argv = process.argv.slice(2),
  error = console.error,
  fsImpl = fs,
  log = console.log,
  rootDir = ROOT_DIR,
  runner = defaultRunner,
} = {}) {
  try {
    const options = parseArgs(argv);

    if (options.help) {
      log(usage());
      return 0;
    }

    const result = options.reset
      ? resetRedis({ ...options, fsImpl, rootDir, runner })
      : setupRedis({ ...options, fsImpl, rootDir, runner });
    log(options.reset ? formatResetResult(result) : formatSetupResult(result));

    if (result.startExitCode && result.startExitCode !== 0) {
      return result.startExitCode;
    }
    if (result.flushExitCode && result.flushExitCode !== 0) {
      return result.flushExitCode;
    }
    return 0;
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    error(usage());
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  DEFAULT_REDIS_TOKEN,
  DEFAULT_REDIS_URL,
  DEFAULT_WEB_ENV_FILE,
  formatResetResult,
  formatSetupResult,
  parseArgs,
  resetRedis,
  runCli,
  setupRedis,
  updateEnvContent,
};
