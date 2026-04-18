const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const WEB_ENV_FILE = path.join(ROOT_DIR, 'apps', 'web', '.env.local');
const DOCKER_WEB_RUNTIME_DIR = path.join(ROOT_DIR, 'tmp', 'docker-web');
const DOCKER_WEB_REDIS_TOKEN_FILE = path.join(
  DOCKER_WEB_RUNTIME_DIR,
  'redis-token'
);
const LOCALHOST_HOSTS = new Set([
  '127.0.0.1',
  '0.0.0.0',
  'localhost',
  '::1',
  '[::1]',
]);
const DOCKER_HOST_ALIAS = 'host.docker.internal';
const DOCKER_REDIS_SERVICE_URL = 'http://serverless-redis-http:80';

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
    const value = stripUnquotedInlineComment(
      line.slice(separatorIndex + 1).trim()
    );
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
  rootDir = ROOT_DIR,
} = {}) {
  const envFile = parseEnvFile(envFilePath, fsImpl);
  const nextPublicSupabaseUrl =
    envFile.NEXT_PUBLIC_SUPABASE_URL ?? baseEnv.NEXT_PUBLIC_SUPABASE_URL;
  const dockerInternalSupabaseUrl =
    baseEnv.DOCKER_INTERNAL_SUPABASE_URL ??
    rewriteLocalhostUrl(nextPublicSupabaseUrl);
  const dockerRedisRuntime = getDockerRedisRuntime({
    baseEnv,
    fsImpl,
    rootDir,
  });

  const composeEnv = {
    ...baseEnv,
    COMPOSE_DOCKER_CLI_BUILD: baseEnv.COMPOSE_DOCKER_CLI_BUILD ?? '1',
    DOCKER_UPSTASH_REDIS_REST_TOKEN: dockerRedisRuntime.token,
    DOCKER_UPSTASH_REDIS_REST_URL:
      baseEnv.DOCKER_UPSTASH_REDIS_REST_URL ?? DOCKER_REDIS_SERVICE_URL,
    DOCKER_BUILDKIT: baseEnv.DOCKER_BUILDKIT ?? '1',
  };

  if (dockerInternalSupabaseUrl) {
    composeEnv.DOCKER_INTERNAL_SUPABASE_URL = dockerInternalSupabaseUrl;
  }

  return composeEnv;
}

function ensureWebEnvFile(fsImpl = fs, envFilePath = WEB_ENV_FILE) {
  if (!fsImpl.existsSync(envFilePath)) {
    throw new Error(
      `Missing required env file: ${path.relative(ROOT_DIR, envFilePath)}`
    );
  }
}

function ensureProductionRedisToken(
  parsed,
  baseEnv = process.env,
  hasComposeProfile,
  options = {}
) {
  if (
    parsed.mode !== 'prod' ||
    !hasComposeProfile(parsed.composeGlobalArgs, 'redis')
  ) {
    return;
  }

  getDockerRedisRuntime({
    baseEnv,
    fsImpl: options.fsImpl,
    rootDir: options.rootDir,
  });
}

function getDockerWebRuntimePaths(rootDir = ROOT_DIR) {
  return {
    redisTokenFile: path.join(rootDir, 'tmp', 'docker-web', 'redis-token'),
    runtimeDir: path.join(rootDir, 'tmp', 'docker-web'),
  };
}

function ensureDockerWebRuntime(
  paths = getDockerWebRuntimePaths(),
  fsImpl = fs
) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
}

function getPersistedDockerRedisToken(
  paths = getDockerWebRuntimePaths(),
  fsImpl = fs
) {
  if (!fsImpl.existsSync(paths.redisTokenFile)) {
    return null;
  }

  const token = fsImpl.readFileSync(paths.redisTokenFile, 'utf8').trim();
  return token || null;
}

function writeDockerRedisToken(
  token,
  paths = getDockerWebRuntimePaths(),
  fsImpl = fs
) {
  ensureDockerWebRuntime(paths, fsImpl);
  fsImpl.writeFileSync(paths.redisTokenFile, `${token}\n`, 'utf8');
}

function generateDockerRedisToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getDockerRedisRuntime({
  baseEnv = process.env,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const token =
    baseEnv.DOCKER_UPSTASH_REDIS_REST_TOKEN ??
    baseEnv.UPSTASH_REDIS_REST_TOKEN ??
    getPersistedDockerRedisToken(getDockerWebRuntimePaths(rootDir), fsImpl) ??
    generateDockerRedisToken();

  if (
    token !== baseEnv.DOCKER_UPSTASH_REDIS_REST_TOKEN &&
    token !== baseEnv.UPSTASH_REDIS_REST_TOKEN
  ) {
    writeDockerRedisToken(token, getDockerWebRuntimePaths(rootDir), fsImpl);
  }

  return {
    token,
    url: baseEnv.DOCKER_UPSTASH_REDIS_REST_URL ?? DOCKER_REDIS_SERVICE_URL,
  };
}

module.exports = {
  DOCKER_REDIS_SERVICE_URL,
  DOCKER_WEB_REDIS_TOKEN_FILE,
  DOCKER_WEB_RUNTIME_DIR,
  DOCKER_HOST_ALIAS,
  WEB_ENV_FILE,
  ensureProductionRedisToken,
  ensureDockerWebRuntime,
  ensureWebEnvFile,
  generateDockerRedisToken,
  getComposeEnvironment,
  getDockerRedisRuntime,
  getDockerWebRuntimePaths,
  getPersistedDockerRedisToken,
  parseEnvFile,
  rewriteLocalhostUrl,
  stripUnquotedInlineComment,
  writeDockerRedisToken,
};
