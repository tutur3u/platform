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
const DOCKER_WEB_MARKITDOWN_TOKEN_FILE = path.join(
  DOCKER_WEB_RUNTIME_DIR,
  'markitdown-token'
);
const DOCKER_WEB_STORAGE_UNZIP_TOKEN_FILE = path.join(
  DOCKER_WEB_RUNTIME_DIR,
  'storage-unzip-token'
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
const DOCKER_MARKITDOWN_SERVICE_URL = 'http://markitdown:8000';
const DOCKER_MARKITDOWN_ENDPOINT_URL = `${DOCKER_MARKITDOWN_SERVICE_URL}/markitdown`;
const DOCKER_STORAGE_UNZIP_PROXY_URL =
  'http://storage-unzip-proxy:8788/extract';

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

function getFirstNonBlank(values) {
  return values.find(
    (value) => typeof value === 'string' && value.trim().length > 0
  );
}

function getComposeEnvironment({
  baseEnv = process.env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  rootDir = ROOT_DIR,
  withSupportServices = false,
  withRedis = true,
} = {}) {
  const envFile = parseEnvFile(envFilePath, fsImpl);
  const nextPublicSupabaseUrl =
    envFile.NEXT_PUBLIC_SUPABASE_URL ?? baseEnv.NEXT_PUBLIC_SUPABASE_URL;
  const dockerInternalSupabaseUrl = rewriteLocalhostUrl(
    envFile.SUPABASE_SERVER_URL ??
      baseEnv.SUPABASE_SERVER_URL ??
      baseEnv.DOCKER_INTERNAL_SUPABASE_URL ??
      nextPublicSupabaseUrl
  );

  const composeEnv = {
    ...baseEnv,
    COMPOSE_DOCKER_CLI_BUILD: baseEnv.COMPOSE_DOCKER_CLI_BUILD ?? '1',
    DOCKER_BUILDKIT: baseEnv.DOCKER_BUILDKIT ?? '1',
  };

  if (dockerInternalSupabaseUrl) {
    composeEnv.SUPABASE_URL = dockerInternalSupabaseUrl;
    composeEnv.SUPABASE_SERVER_URL = dockerInternalSupabaseUrl;
  }

  if (withRedis) {
    const dockerRedisRuntime = getDockerRedisRuntime({
      baseEnv,
      fsImpl,
      rootDir,
    });

    composeEnv.UPSTASH_REDIS_REST_TOKEN = dockerRedisRuntime.token;
    composeEnv.UPSTASH_REDIS_REST_URL = dockerRedisRuntime.url;
    composeEnv.SRH_TOKEN = dockerRedisRuntime.token;
  }

  if (withSupportServices) {
    const dockerMarkitdownRuntime = getDockerMarkitdownRuntime({
      baseEnv,
      fsImpl,
      rootDir,
    });
    composeEnv.DISCORD_APP_DEPLOYMENT_URL = dockerMarkitdownRuntime.serviceUrl;
    composeEnv.MARKITDOWN_ENDPOINT_SECRET = dockerMarkitdownRuntime.secret;
    composeEnv.MARKITDOWN_ENDPOINT_URL = dockerMarkitdownRuntime.endpointUrl;

    const dockerStorageUnzipRuntime = getDockerStorageUnzipRuntime({
      baseEnv,
      fsImpl,
      rootDir,
    });
    composeEnv.DRIVE_AUTO_EXTRACT_PROXY_TOKEN = dockerStorageUnzipRuntime.token;
    composeEnv.DRIVE_AUTO_EXTRACT_PROXY_URL = dockerStorageUnzipRuntime.url;
    composeEnv.DRIVE_UNZIP_PROXY_SHARED_TOKEN = dockerStorageUnzipRuntime.token;
    composeEnv.INTERNAL_WEB_API_ORIGIN =
      getFirstNonBlank([
        baseEnv.DOCKER_INTERNAL_WEB_API_ORIGIN,
        baseEnv.INTERNAL_WEB_API_ORIGIN,
      ]) ?? 'http://web-proxy:7803';
  }

  return composeEnv;
}

function ensureRequiredComposeEnvironment(
  composeEnv,
  { withRedis = true } = {}
) {
  const missing = [];

  if (
    typeof composeEnv.SUPABASE_SERVER_URL !== 'string' ||
    composeEnv.SUPABASE_SERVER_URL.trim().length === 0
  ) {
    missing.push('SUPABASE_SERVER_URL');
  }

  if (withRedis) {
    for (const key of ['UPSTASH_REDIS_REST_TOKEN', 'UPSTASH_REDIS_REST_URL']) {
      if (
        typeof composeEnv[key] !== 'string' ||
        composeEnv[key].trim().length === 0
      ) {
        missing.push(key);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required Docker runtime env: ${missing.join(', ')}`
    );
  }
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
    markitdownTokenFile: path.join(
      rootDir,
      'tmp',
      'docker-web',
      'markitdown-token'
    ),
    redisTokenFile: path.join(rootDir, 'tmp', 'docker-web', 'redis-token'),
    runtimeDir: path.join(rootDir, 'tmp', 'docker-web'),
    storageUnzipTokenFile: path.join(
      rootDir,
      'tmp',
      'docker-web',
      'storage-unzip-token'
    ),
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

function getPersistedDockerToken(tokenFile, fsImpl = fs) {
  if (!fsImpl.existsSync(tokenFile)) {
    return null;
  }

  const token = fsImpl.readFileSync(tokenFile, 'utf8').trim();
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

function writeDockerToken(token, tokenFile, paths, fsImpl = fs) {
  ensureDockerWebRuntime(paths, fsImpl);
  fsImpl.writeFileSync(tokenFile, `${token}\n`, 'utf8');
}

function generateDockerRedisToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateDockerServiceToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getDockerRedisRuntime({
  baseEnv = process.env,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const envToken = getFirstNonBlank([
    baseEnv.DOCKER_UPSTASH_REDIS_REST_TOKEN,
    baseEnv.UPSTASH_REDIS_REST_TOKEN,
  ]);
  const envUrl = getFirstNonBlank([
    baseEnv.DOCKER_UPSTASH_REDIS_REST_URL,
    baseEnv.UPSTASH_REDIS_REST_URL,
  ]);
  const token =
    envToken ??
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
    url: envUrl ?? DOCKER_REDIS_SERVICE_URL,
  };
}

function getDockerMarkitdownRuntime({
  baseEnv = process.env,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const paths = getDockerWebRuntimePaths(rootDir);
  const envSecret = getFirstNonBlank([
    baseEnv.DOCKER_MARKITDOWN_ENDPOINT_SECRET,
    baseEnv.MARKITDOWN_ENDPOINT_SECRET,
    baseEnv.VERCEL_CRON_SECRET,
    baseEnv.CRON_SECRET,
  ]);
  const secret =
    envSecret ??
    getPersistedDockerToken(paths.markitdownTokenFile, fsImpl) ??
    generateDockerServiceToken();

  if (secret !== envSecret) {
    writeDockerToken(secret, paths.markitdownTokenFile, paths, fsImpl);
  }

  const serviceUrl =
    getFirstNonBlank([
      baseEnv.DOCKER_DISCORD_APP_DEPLOYMENT_URL,
      baseEnv.DOCKER_MARKITDOWN_SERVICE_URL,
    ]) ?? DOCKER_MARKITDOWN_SERVICE_URL;
  const endpointUrl =
    getFirstNonBlank([
      baseEnv.DOCKER_MARKITDOWN_ENDPOINT_URL,
      baseEnv.MARKITDOWN_ENDPOINT_URL,
    ]) ?? DOCKER_MARKITDOWN_ENDPOINT_URL;

  return {
    endpointUrl,
    secret,
    serviceUrl,
  };
}

function getDockerStorageUnzipRuntime({
  baseEnv = process.env,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const paths = getDockerWebRuntimePaths(rootDir);
  const envToken = getFirstNonBlank([
    baseEnv.DOCKER_DRIVE_UNZIP_PROXY_SHARED_TOKEN,
    baseEnv.DOCKER_DRIVE_AUTO_EXTRACT_PROXY_TOKEN,
    baseEnv.DRIVE_UNZIP_PROXY_SHARED_TOKEN,
    baseEnv.DRIVE_AUTO_EXTRACT_PROXY_TOKEN,
  ]);
  const token =
    envToken ??
    getPersistedDockerToken(paths.storageUnzipTokenFile, fsImpl) ??
    generateDockerServiceToken();

  if (token !== envToken) {
    writeDockerToken(token, paths.storageUnzipTokenFile, paths, fsImpl);
  }

  return {
    token,
    url:
      getFirstNonBlank([
        baseEnv.DOCKER_DRIVE_AUTO_EXTRACT_PROXY_URL,
        baseEnv.DRIVE_AUTO_EXTRACT_PROXY_URL,
      ]) ?? DOCKER_STORAGE_UNZIP_PROXY_URL,
  };
}

module.exports = {
  DOCKER_MARKITDOWN_ENDPOINT_URL,
  DOCKER_MARKITDOWN_SERVICE_URL,
  DOCKER_REDIS_SERVICE_URL,
  DOCKER_STORAGE_UNZIP_PROXY_URL,
  DOCKER_WEB_MARKITDOWN_TOKEN_FILE,
  DOCKER_WEB_REDIS_TOKEN_FILE,
  DOCKER_WEB_RUNTIME_DIR,
  DOCKER_WEB_STORAGE_UNZIP_TOKEN_FILE,
  DOCKER_HOST_ALIAS,
  WEB_ENV_FILE,
  ensureProductionRedisToken,
  ensureRequiredComposeEnvironment,
  ensureDockerWebRuntime,
  ensureWebEnvFile,
  generateDockerRedisToken,
  generateDockerServiceToken,
  getComposeEnvironment,
  getDockerMarkitdownRuntime,
  getDockerRedisRuntime,
  getDockerStorageUnzipRuntime,
  getDockerWebRuntimePaths,
  getPersistedDockerRedisToken,
  parseEnvFile,
  rewriteLocalhostUrl,
  stripUnquotedInlineComment,
  writeDockerRedisToken,
};
