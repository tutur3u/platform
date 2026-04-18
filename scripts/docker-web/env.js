const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const WEB_ENV_FILE = path.join(ROOT_DIR, 'apps', 'web', '.env.local');
const LOCALHOST_HOSTS = new Set([
  '127.0.0.1',
  '0.0.0.0',
  'localhost',
  '::1',
  '[::1]',
]);
const DOCKER_HOST_ALIAS = 'host.docker.internal';

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
} = {}) {
  const envFile = parseEnvFile(envFilePath, fsImpl);
  const nextPublicSupabaseUrl =
    envFile.NEXT_PUBLIC_SUPABASE_URL ?? baseEnv.NEXT_PUBLIC_SUPABASE_URL;
  const dockerInternalSupabaseUrl =
    rewriteLocalhostUrl(nextPublicSupabaseUrl) ??
    `http://${DOCKER_HOST_ALIAS}:8001`;

  return {
    ...baseEnv,
    COMPOSE_DOCKER_CLI_BUILD: baseEnv.COMPOSE_DOCKER_CLI_BUILD ?? '1',
    DOCKER_INTERNAL_SUPABASE_URL: dockerInternalSupabaseUrl,
    DOCKER_BUILDKIT: baseEnv.DOCKER_BUILDKIT ?? '1',
  };
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
  hasComposeProfile
) {
  if (
    parsed.mode !== 'prod' ||
    !hasComposeProfile(parsed.composeGlobalArgs, 'redis')
  ) {
    return;
  }

  if (baseEnv.SRH_TOKEN) {
    return;
  }

  throw new Error(
    'Missing required environment variable: SRH_TOKEN must be set before using the production Redis profile.'
  );
}

module.exports = {
  DOCKER_HOST_ALIAS,
  WEB_ENV_FILE,
  ensureProductionRedisToken,
  ensureWebEnvFile,
  getComposeEnvironment,
  parseEnvFile,
  rewriteLocalhostUrl,
  stripUnquotedInlineComment,
};
