const path = require('node:path');

const LOCAL_E2E_PORTLESS_PORT = '1355';
const LOCAL_E2E_BASE_URL = `https://tuturuuu.localhost:${LOCAL_E2E_PORTLESS_PORT}`;
const LOCAL_E2E_SUPABASE_URL = 'http://127.0.0.1:8001';
const LOCAL_E2E_DOCKER_SUPABASE_URL = 'http://host.docker.internal:8001';
const LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_E2E_SUPABASE_SECRET_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const LOCAL_E2E_APP_COORDINATION_SECRET = 'local-e2e-app-coordination-secret';
const LOCAL_E2E_CRON_SECRET = 'local-e2e-cron-secret';
const LOCAL_E2E_AUTH_BYPASS = 'true';
const LOCAL_E2E_SUPERMEMORY_ENABLED = 'false';
const LOCAL_E2E_SUPERMEMORY_POSTGRES_PASSWORD =
  'local-e2e-supermemory-postgres-password';
const LOCAL_E2E_UPSTASH_REDIS_REST_TOKEN = 'local-e2e-upstash-redis-rest-token';
const LOCAL_E2E_UPSTASH_REDIS_REST_URL = 'http://serverless-redis-http:80';
const LOCAL_E2E_PROXY_READ_LIMITS = Object.freeze({
  API_PROXY_ANON_READ_LIMIT_DAY: '1000000',
  API_PROXY_ANON_READ_LIMIT_HOUR: '200000',
  API_PROXY_ANON_READ_LIMIT_MINUTE: '20000',
  API_PROXY_TASK_BOARD_READ_LIMIT_DAY: '1000000',
  API_PROXY_TASK_BOARD_READ_LIMIT_HOUR: '200000',
  API_PROXY_TASK_BOARD_READ_LIMIT_MINUTE: '20000',
});

const SAFE_LOCAL_WEB_ORIGINS = new Set([
  'http://127.0.0.1:7803',
  'http://localhost:7803',
  'https://tuturuuu.localhost',
  `https://tuturuuu.localhost:${LOCAL_E2E_PORTLESS_PORT}`,
]);
const SAFE_LOCAL_SUPABASE_ORIGINS = new Set([
  'http://127.0.0.1:8001',
  'http://host.docker.internal:8001',
  'http://localhost:8001',
]);

function getUrlOrigin(name, value) {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`Invalid ${name} URL for E2E: ${value}`);
  }
}

function assertAllowedOrigin(name, value, allowedOrigins) {
  const origin = getUrlOrigin(name, value);

  if (!allowedOrigins.has(origin)) {
    throw new Error(`Refusing to run E2E with non-local ${name}: ${origin}`);
  }

  return origin;
}

function assertNoCloudSupabaseReference(name, value) {
  if (!value) {
    return;
  }

  if (/supabase\.(co|in)/iu.test(String(value))) {
    throw new Error(`Refusing to run E2E with cloud ${name}: ${value}`);
  }
}

function assertSafeE2EEnvironment(env = process.env) {
  const baseUrl = env.BASE_URL ?? LOCAL_E2E_BASE_URL;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;

  assertAllowedOrigin('BASE_URL', baseUrl, SAFE_LOCAL_WEB_ORIGINS);
  for (const key of [
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_WEB_APP_URL',
    'PORTLESS_URL',
    'WEB_APP_URL',
  ]) {
    if (env[key]) {
      assertAllowedOrigin(key, env[key], SAFE_LOCAL_WEB_ORIGINS);
    }
  }

  assertAllowedOrigin(
    'NEXT_PUBLIC_SUPABASE_URL',
    supabaseUrl,
    SAFE_LOCAL_SUPABASE_ORIGINS
  );

  for (const key of [
    'DOCKER_INTERNAL_SUPABASE_URL',
    'SUPABASE_SERVER_URL',
    'SUPABASE_URL',
  ]) {
    if (env[key]) {
      assertAllowedOrigin(key, env[key], SAFE_LOCAL_SUPABASE_ORIGINS);
    }
  }

  for (const key of [
    'DATABASE_URL',
    'DIRECT_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'POSTGRES_URL',
    'SUPABASE_SERVER_URL',
    'SUPABASE_URL',
  ]) {
    assertNoCloudSupabaseReference(key, env[key]);
  }

  return {
    baseUrl,
    supabaseUrl,
  };
}

function toRootRelativePath(rootDir, filePath) {
  return path.isAbsolute(filePath)
    ? path.relative(rootDir, filePath)
    : filePath;
}

function toComposeFragmentEnvFilePath(rootDir, filePath) {
  const relativePath = toRootRelativePath(rootDir, filePath);

  if (path.isAbsolute(relativePath) || relativePath.startsWith('..')) {
    return filePath;
  }

  return `../${relativePath}`;
}

function getDefaultE2EComposeProjectName(env = process.env) {
  if (env.DOCKER_WEB_COMPOSE_PROJECT_NAME) {
    return env.DOCKER_WEB_COMPOSE_PROJECT_NAME;
  }

  const runId = env.GITHUB_RUN_ID ?? 'local';
  const shard = env.E2E_SHARD_INDEX ?? env.PLAYWRIGHT_SHARD ?? process.pid;
  const name = `ttr-e2e-${runId}-${shard}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

  return name.slice(0, 50);
}

function createLocalE2EProcessEnv(baseEnv = process.env, options = {}) {
  const rootDir = options.rootDir ?? path.resolve(__dirname, '..');
  const envFilePath =
    options.envFilePath ?? path.join(rootDir, 'tmp', 'e2e', 'web.env');
  const rootRelativeEnvFilePath = toRootRelativePath(rootDir, envFilePath);
  const composeEnvFilePath = toComposeFragmentEnvFilePath(rootDir, envFilePath);

  return {
    ...baseEnv,
    APP_COORDINATION_TOKEN_SECRET: LOCAL_E2E_APP_COORDINATION_SECRET,
    BASE_URL: LOCAL_E2E_BASE_URL,
    CRON_SECRET: LOCAL_E2E_CRON_SECRET,
    DATABASE_URL: '',
    DIRECT_URL: '',
    DOCKER_INTERNAL_SUPABASE_URL: LOCAL_E2E_DOCKER_SUPABASE_URL,
    DOCKER_SUPERMEMORY_ENABLED: LOCAL_E2E_SUPERMEMORY_ENABLED,
    DOCKER_WEB_ALLOW_LOCAL_SUPABASE: '1',
    DOCKER_UPSTASH_REDIS_REST_TOKEN: LOCAL_E2E_UPSTASH_REDIS_REST_TOKEN,
    DOCKER_UPSTASH_REDIS_REST_URL: LOCAL_E2E_UPSTASH_REDIS_REST_URL,
    DOCKER_WEB_COMPOSE_ENV_FILE: composeEnvFilePath,
    DOCKER_WEB_COMPOSE_LEGACY_ENV_FILE: composeEnvFilePath,
    DOCKER_WEB_COMPOSE_PROJECT_NAME: getDefaultE2EComposeProjectName(baseEnv),
    DOCKER_WEB_ENV_FILE: rootRelativeEnvFilePath,
    NEXT_PUBLIC_APP_URL: LOCAL_E2E_BASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: LOCAL_E2E_SUPABASE_URL,
    NEXT_PUBLIC_TUTURUUU_LOCAL_E2E_AUTH_BYPASS: LOCAL_E2E_AUTH_BYPASS,
    NEXT_PUBLIC_WEB_APP_URL: LOCAL_E2E_BASE_URL,
    POSTGRES_URL: '',
    PORTLESS_PORT: LOCAL_E2E_PORTLESS_PORT,
    PORTLESS_URL: LOCAL_E2E_BASE_URL,
    SUPABASE_SECRET_KEY: LOCAL_E2E_SUPABASE_SECRET_KEY,
    SUPABASE_SERVER_URL: LOCAL_E2E_DOCKER_SUPABASE_URL,
    SUPABASE_URL: LOCAL_E2E_DOCKER_SUPABASE_URL,
    SUPERMEMORY_ENABLED: LOCAL_E2E_SUPERMEMORY_ENABLED,
    SUPERMEMORY_POSTGRES_PASSWORD: LOCAL_E2E_SUPERMEMORY_POSTGRES_PASSWORD,
    SRH_TOKEN: LOCAL_E2E_UPSTASH_REDIS_REST_TOKEN,
    TUTURUUU_APP_COORDINATION_SECRET: LOCAL_E2E_APP_COORDINATION_SECRET,
    TUTURUUU_LOCAL_E2E_AUTH_BYPASS: LOCAL_E2E_AUTH_BYPASS,
    UPSTASH_REDIS_REST_TOKEN: LOCAL_E2E_UPSTASH_REDIS_REST_TOKEN,
    UPSTASH_REDIS_REST_URL: LOCAL_E2E_UPSTASH_REDIS_REST_URL,
    VERCEL_CRON_SECRET: LOCAL_E2E_CRON_SECRET,
    WEB_APP_URL: LOCAL_E2E_BASE_URL,
    ...LOCAL_E2E_PROXY_READ_LIMITS,
  };
}

function createLocalE2EEnvFileContent(overrides = {}) {
  const values = {
    APP_COORDINATION_TOKEN_SECRET: LOCAL_E2E_APP_COORDINATION_SECRET,
    BASE_URL: LOCAL_E2E_BASE_URL,
    CRON_SECRET: LOCAL_E2E_CRON_SECRET,
    NEXT_PUBLIC_APP_URL: LOCAL_E2E_BASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: LOCAL_E2E_SUPABASE_URL,
    NEXT_PUBLIC_TUTURUUU_LOCAL_E2E_AUTH_BYPASS: LOCAL_E2E_AUTH_BYPASS,
    NEXT_PUBLIC_WEB_APP_URL: LOCAL_E2E_BASE_URL,
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_ENV: 'production',
    PORTLESS_PORT: LOCAL_E2E_PORTLESS_PORT,
    PORTLESS_URL: LOCAL_E2E_BASE_URL,
    SUPABASE_SECRET_KEY: LOCAL_E2E_SUPABASE_SECRET_KEY,
    SUPABASE_SERVER_URL: LOCAL_E2E_DOCKER_SUPABASE_URL,
    SUPABASE_URL: LOCAL_E2E_DOCKER_SUPABASE_URL,
    DOCKER_WEB_ALLOW_LOCAL_SUPABASE: '1',
    DOCKER_SUPERMEMORY_ENABLED: LOCAL_E2E_SUPERMEMORY_ENABLED,
    DOCKER_UPSTASH_REDIS_REST_TOKEN: LOCAL_E2E_UPSTASH_REDIS_REST_TOKEN,
    DOCKER_UPSTASH_REDIS_REST_URL: LOCAL_E2E_UPSTASH_REDIS_REST_URL,
    SUPERMEMORY_ENABLED: LOCAL_E2E_SUPERMEMORY_ENABLED,
    SUPERMEMORY_POSTGRES_PASSWORD: LOCAL_E2E_SUPERMEMORY_POSTGRES_PASSWORD,
    SRH_TOKEN: LOCAL_E2E_UPSTASH_REDIS_REST_TOKEN,
    TUTURUUU_APP_COORDINATION_SECRET: LOCAL_E2E_APP_COORDINATION_SECRET,
    TUTURUUU_LOCAL_E2E_AUTH_BYPASS: LOCAL_E2E_AUTH_BYPASS,
    UPSTASH_REDIS_REST_TOKEN: LOCAL_E2E_UPSTASH_REDIS_REST_TOKEN,
    UPSTASH_REDIS_REST_URL: LOCAL_E2E_UPSTASH_REDIS_REST_URL,
    VERCEL_CRON_SECRET: LOCAL_E2E_CRON_SECRET,
    WEB_APP_URL: LOCAL_E2E_BASE_URL,
    ...LOCAL_E2E_PROXY_READ_LIMITS,
    ...overrides,
  };

  return `${Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;
}

module.exports = {
  LOCAL_E2E_APP_COORDINATION_SECRET,
  LOCAL_E2E_AUTH_BYPASS,
  LOCAL_E2E_BASE_URL,
  LOCAL_E2E_CRON_SECRET,
  LOCAL_E2E_DOCKER_SUPABASE_URL,
  LOCAL_E2E_PORTLESS_PORT,
  LOCAL_E2E_SUPERMEMORY_ENABLED,
  LOCAL_E2E_SUPERMEMORY_POSTGRES_PASSWORD,
  LOCAL_E2E_SUPABASE_PUBLISHABLE_KEY,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
  LOCAL_E2E_PROXY_READ_LIMITS,
  LOCAL_E2E_UPSTASH_REDIS_REST_TOKEN,
  LOCAL_E2E_UPSTASH_REDIS_REST_URL,
  SAFE_LOCAL_SUPABASE_ORIGINS,
  SAFE_LOCAL_WEB_ORIGINS,
  assertSafeE2EEnvironment,
  createLocalE2EEnvFileContent,
  createLocalE2EProcessEnv,
  getDefaultE2EComposeProjectName,
  toComposeFragmentEnvFilePath,
  toRootRelativePath,
};
