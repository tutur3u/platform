#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const COMPOSE_FILE = path.join(ROOT_DIR, 'docker-compose.web.yml');
const WEB_ENV_FILE = path.join(ROOT_DIR, 'apps', 'web', '.env.local');
const LOCALHOST_HOSTS = new Set(['127.0.0.1', '0.0.0.0', 'localhost']);
const DOCKER_HOST_ALIAS = 'host.docker.internal';

function parseArgs(argv) {
  const args = [...argv];
  const action = args.shift() ?? 'up';

  if (action !== 'up' && action !== 'down') {
    throw new Error(`Unsupported action "${action}". Use "up" or "down".`);
  }

  const composeGlobalArgs = [];
  const composeArgs = [];
  let withSupabase = false;
  let resetSupabase = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--with-supabase') {
      withSupabase = true;
      continue;
    }

    if (arg === '--reset-supabase') {
      withSupabase = true;
      resetSupabase = true;
      continue;
    }

    if (arg === '--profile') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('Expected a profile name after --profile.');
      }

      composeGlobalArgs.push(arg, value);
      index += 1;
      continue;
    }

    composeArgs.push(arg);
  }

  return {
    action,
    composeArgs,
    composeGlobalArgs,
    resetSupabase,
    withSupabase,
  };
}

function parseEnvFile(envFilePath, fsImpl = fs) {
  if (!fsImpl.existsSync(envFilePath)) {
    return {};
  }

  const content = fsImpl.readFileSync(envFilePath, 'utf8');
  const values = {};

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
    const value = line.slice(separatorIndex + 1).trim();
    values[key] = value.replace(/^(['"])(.*)\1$/u, '$2');
  }

  return values;
}

function rewriteLocalhostUrl(rawUrl) {
  if (!rawUrl) {
    return undefined;
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  if (!LOCALHOST_HOSTS.has(parsedUrl.hostname)) {
    return rawUrl;
  }

  parsedUrl.hostname = DOCKER_HOST_ALIAS;
  return parsedUrl.toString();
}

function getComposeEnvironment({
  baseEnv = process.env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
} = {}) {
  const envFile = parseEnvFile(envFilePath, fsImpl);
  const nextPublicSupabaseUrl =
    envFile.NEXT_PUBLIC_SUPABASE_URL ?? baseEnv.NEXT_PUBLIC_SUPABASE_URL;
  const dockerInternalSupabaseUrl =
    rewriteLocalhostUrl(nextPublicSupabaseUrl) ??
    `http://${DOCKER_HOST_ALIAS}:8001`;

  return {
    ...baseEnv,
    DOCKER_INTERNAL_SUPABASE_URL: dockerInternalSupabaseUrl,
  };
}

function ensureWebEnvFile(fsImpl = fs, envFilePath = WEB_ENV_FILE) {
  if (!fsImpl.existsSync(envFilePath)) {
    throw new Error(
      `Missing required env file: ${path.relative(ROOT_DIR, envFilePath)}`
    );
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = (options.spawnImpl ?? spawn)(command, args, {
      cwd: options.cwd ?? ROOT_DIR,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({
        code: code ?? 1,
        signal: signal ?? null,
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
    const error = new Error(
      `Command failed (${result.code}): ${failedCommand}`
    );
    error.exitCode = result.code;
    throw error;
  }

  return result;
}

async function runDockerWebWorkflow(parsed, options = {}) {
  const run = options.runCommand ?? runCommand;
  const fsImpl = options.fsImpl ?? fs;

  await runChecked('docker', ['compose', 'version'], {
    env: options.env ?? process.env,
    fsImpl,
    runCommand: run,
    stdio: 'ignore',
  });

  if (parsed.action === 'down') {
    await runChecked(
      'docker',
      [
        'compose',
        '-f',
        COMPOSE_FILE,
        ...parsed.composeGlobalArgs,
        'down',
        '--remove-orphans',
        ...parsed.composeArgs,
      ],
      {
        env: getComposeEnvironment({
          baseEnv: options.env ?? process.env,
          fsImpl,
        }),
        fsImpl,
        runCommand: run,
      }
    );
    return;
  }

  ensureWebEnvFile(fsImpl);

  if (parsed.withSupabase) {
    await runChecked('bun', ['sb:start'], {
      env: options.env ?? process.env,
      fsImpl,
      runCommand: run,
    });
  }

  if (parsed.resetSupabase) {
    await runChecked('bun', ['sb:reset'], {
      env: options.env ?? process.env,
      fsImpl,
      runCommand: run,
    });
  }

  await runChecked(
    'docker',
    [
      'compose',
      '-f',
      COMPOSE_FILE,
      ...parsed.composeGlobalArgs,
      'up',
      '--build',
      '--remove-orphans',
      ...parsed.composeArgs,
    ],
    {
      env: getComposeEnvironment({
        baseEnv: options.env ?? process.env,
        fsImpl,
      }),
      fsImpl,
      runCommand: run,
    }
  );
}

async function main(argv = process.argv.slice(2), options = {}) {
  try {
    const parsed = parseArgs(argv);
    await runDockerWebWorkflow(parsed, options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode =
      error && typeof error === 'object' && typeof error.exitCode === 'number'
        ? error.exitCode
        : 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  COMPOSE_FILE,
  DOCKER_HOST_ALIAS,
  WEB_ENV_FILE,
  ensureWebEnvFile,
  getComposeEnvironment,
  main,
  parseArgs,
  parseEnvFile,
  rewriteLocalhostUrl,
  runDockerWebWorkflow,
};
