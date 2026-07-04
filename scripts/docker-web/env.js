const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const WEB_ENV_FILE = path.join(ROOT_DIR, '.env.local');
const LEGACY_WEB_ENV_FILE = path.join(ROOT_DIR, 'apps', 'web', '.env.local');
const DOCKER_WEB_RUNTIME_DIR = path.join(ROOT_DIR, 'tmp', 'docker-web');
const DOCKER_WEB_REDIS_TOKEN_FILE = path.join(
  DOCKER_WEB_RUNTIME_DIR,
  'redis-token'
);
const DOCKER_WEB_BACKEND_TOKEN_FILE = path.join(
  DOCKER_WEB_RUNTIME_DIR,
  'backend-token'
);
const DOCKER_WEB_MARKITDOWN_TOKEN_FILE = path.join(
  DOCKER_WEB_RUNTIME_DIR,
  'markitdown-token'
);
const DOCKER_WEB_CRON_TOKEN_FILE = path.join(
  DOCKER_WEB_RUNTIME_DIR,
  'cron-token'
);
const DOCKER_WEB_DOCKER_CONTROL_TOKEN_FILE = path.join(
  DOCKER_WEB_RUNTIME_DIR,
  'docker-control-token'
);
const DOCKER_WEB_STORAGE_UNZIP_TOKEN_FILE = path.join(
  DOCKER_WEB_RUNTIME_DIR,
  'storage-unzip-token'
);
const DOCKER_WEB_SUPERMEMORY_API_KEY_FILE = path.join(
  DOCKER_WEB_RUNTIME_DIR,
  'supermemory-api-key'
);
const DOCKER_WEB_SUPERMEMORY_BETTER_AUTH_SECRET_FILE = path.join(
  DOCKER_WEB_RUNTIME_DIR,
  'supermemory-better-auth-secret'
);
const DOCKER_WEB_SUPERMEMORY_POSTGRES_PASSWORD_FILE = path.join(
  DOCKER_WEB_RUNTIME_DIR,
  'supermemory-postgres-password'
);
const LOCALHOST_HOSTS = new Set([
  '127.0.0.1',
  '0.0.0.0',
  'localhost',
  '::1',
  '[::1]',
]);
const DOCKER_HOST_ALIAS = 'host.docker.internal';
const DOCKER_WEB_ALLOW_LOCAL_SUPABASE_ENV = 'DOCKER_WEB_ALLOW_LOCAL_SUPABASE';
const LOCAL_SUPABASE_PORTS = new Set([
  '8000',
  '8001',
  '54321',
  '54322',
  '54323',
  '54324',
  '54325',
  '54326',
  '54327',
  '54328',
  '54329',
]);
const SUPABASE_ORIGIN_KEYS = Object.freeze([
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVER_URL',
  'SUPABASE_URL',
  'DOCKER_INTERNAL_SUPABASE_URL',
]);
const DOCKER_REDIS_SERVICE_URL = 'http://serverless-redis-http:80';
const DOCKER_MARKITDOWN_SERVICE_URL = 'http://markitdown:8000';
const DOCKER_MARKITDOWN_ENDPOINT_URL = `${DOCKER_MARKITDOWN_SERVICE_URL}/markitdown`;
const DOCKER_STORAGE_UNZIP_PROXY_URL =
  'http://storage-unzip-proxy:8788/extract';
const DOCKER_PRONUNCIATION_ASSESSOR_URL =
  'http://pronunciation-assessor:8010/assess';
const DOCKER_BACKEND_INTERNAL_URL = 'http://backend:7820';
const DOCKER_CONTROL_INTERNAL_URL = 'http://web-docker-control:7810';
const DOCKER_WEB_NEXT_PRIVATE_ORIGIN = 'http://127.0.0.1:7803';
const DOCKER_SUPERMEMORY_BASE_URL = 'http://supermemory:8787';
const DOCKER_SUPERMEMORY_DATABASE_HOST = 'supermemory-postgres';
const DOCKER_SUPERMEMORY_DATABASE_NAME = 'supermemory';
const DOCKER_SUPERMEMORY_DATABASE_USER = 'supermemory';
const CLOUDFLARED_TOKEN_KEYS = Object.freeze([
  'DOCKER_CLOUDFLARED_TOKEN',
  'CLOUDFLARED_TOKEN',
  'CF_TUNNEL_TOKEN',
]);
const DEFAULT_DOCKER_WEB_COMPOSE_PROJECT_NAME = 'tuturuuu';
const LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME = 'platform';
const DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT_ENV =
  'DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT';
const DOCKER_WEB_GIT_COMMON_DIR_ENV = 'DOCKER_WEB_GIT_COMMON_DIR';
const GIT_LOCAL_ENV_KEYS = Object.freeze([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_PARAMETERS',
  'GIT_DIR',
  'GIT_GRAFT_FILE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_REPLACE_REF_BASE',
  'GIT_SHALLOW_FILE',
  'GIT_WORK_TREE',
]);

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

function sanitizeGitLocalEnv(env = {}) {
  const sanitized = { ...env };

  for (const key of GIT_LOCAL_ENV_KEYS) {
    delete sanitized[key];
  }

  return sanitized;
}

function resolveGitMetadataPath(value, baseDir) {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  if (!trimmed) {
    return null;
  }

  return path.resolve(baseDir, trimmed);
}

function readGitFileReference(filePath, fsImpl) {
  const content = fsImpl.readFileSync(filePath, 'utf8');
  const match = content.match(/^gitdir:\s*(.+?)\s*$/imu);

  return match ? match[1] : null;
}

function resolveLinkedWorktreeGitCommonDir({
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  if (typeof fsImpl.statSync !== 'function') {
    return null;
  }

  const dotGitPath = path.join(rootDir, '.git');

  if (!fsImpl.existsSync(dotGitPath)) {
    return null;
  }

  const dotGitStat = fsImpl.statSync(dotGitPath);

  if (!dotGitStat.isFile()) {
    return null;
  }

  const gitDir = resolveGitMetadataPath(
    readGitFileReference(dotGitPath, fsImpl),
    rootDir
  );

  if (!gitDir) {
    return null;
  }

  const commonDirFile = path.join(gitDir, 'commondir');

  if (!fsImpl.existsSync(commonDirFile)) {
    return gitDir;
  }

  return resolveGitMetadataPath(
    fsImpl.readFileSync(commonDirFile, 'utf8').split(/\r?\n/u)[0],
    gitDir
  );
}

function getWebEnvFileCandidates({
  envFilePath = WEB_ENV_FILE,
  rootDir = ROOT_DIR,
} = {}) {
  const rootEnvFile = path.join(rootDir, '.env.local');
  const legacyEnvFile = path.join(rootDir, 'apps', 'web', '.env.local');

  if (path.resolve(envFilePath) !== path.resolve(rootEnvFile)) {
    return [envFilePath];
  }

  return [legacyEnvFile, rootEnvFile];
}

function parseWebEnvFiles({
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const values = {};

  for (const candidatePath of getWebEnvFileCandidates({
    envFilePath,
    rootDir,
  })) {
    Object.assign(values, parseEnvFile(candidatePath, fsImpl));
  }

  return values;
}

function parseWebEnvFilesWithSources({
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const sources = {};
  const values = {};

  for (const candidatePath of getWebEnvFileCandidates({
    envFilePath,
    rootDir,
  })) {
    const parsed = parseEnvFile(candidatePath, fsImpl);
    const source = path.relative(rootDir, candidatePath) || '.env.local';

    for (const [key, value] of Object.entries(parsed)) {
      values[key] = value;
      sources[key] = source;
    }
  }

  return { sources, values };
}

function resolveWebEnvFile({
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const candidates = getWebEnvFileCandidates({
    envFilePath,
    rootDir,
  }).reverse();
  return candidates.find((candidatePath) => fsImpl.existsSync(candidatePath));
}

function getComposeEnvFileValue({
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const resolvedEnvFile = resolveWebEnvFile({ envFilePath, fsImpl, rootDir });
  if (!resolvedEnvFile) {
    return undefined;
  }

  return path.relative(rootDir, resolvedEnvFile) || '.env.local';
}

function getComposeFragmentEnvFileValue(envFileValue) {
  if (!envFileValue) {
    return undefined;
  }

  if (path.isAbsolute(envFileValue)) {
    return envFileValue;
  }

  return `../${envFileValue}`;
}

function getComposeFragmentEnvFileValues({
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const candidates = getWebEnvFileCandidates({
    envFilePath,
    rootDir,
  });

  const values = candidates
    .filter((candidatePath) => fsImpl.existsSync(candidatePath))
    .map((candidatePath) =>
      getComposeFragmentEnvFileValue(
        path.relative(rootDir, candidatePath) || '.env.local'
      )
    );

  if (values.length === 0) {
    const fallback = getComposeFragmentEnvFileValue(
      path.relative(rootDir, envFilePath) || '.env.local'
    );
    return {
      envFile: fallback,
      legacyEnvFile: fallback,
    };
  }

  return {
    envFile: values.at(-1),
    legacyEnvFile: values[0],
  };
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

function classifySupabaseOrigin(rawUrl) {
  const value = typeof rawUrl === 'string' ? rawUrl.trim() : '';

  if (!value) {
    return 'missing';
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(value);
  } catch {
    return 'invalid';
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  if (
    hostname === DOCKER_HOST_ALIAS ||
    hostname.endsWith('.localhost') ||
    LOCALHOST_HOSTS.has(hostname) ||
    LOCAL_SUPABASE_PORTS.has(parsedUrl.port)
  ) {
    return 'local';
  }

  return 'cloud';
}

function isTruthyEnvValue(value) {
  return /^(1|true|yes)$/iu.test(String(value ?? '').trim());
}

function isFalseyEnvValue(value) {
  return /^(0|false|no|off)$/iu.test(String(value ?? '').trim());
}

function getEnvCandidate({ baseEnv, envData, key }) {
  if (Object.hasOwn(envData.values, key)) {
    return {
      key,
      source: envData.sources[key],
      value: envData.values[key],
    };
  }

  if (Object.hasOwn(baseEnv, key)) {
    return {
      key,
      source: 'process.env',
      value: baseEnv[key],
    };
  }

  return null;
}

function getFirstEnvCandidate(candidates) {
  return candidates.find((candidate) => candidate && candidate.value != null);
}

function getEffectiveEnvFileSource({ envFilePath, fsImpl, rootDir }) {
  const resolvedEnvFile = resolveWebEnvFile({
    envFilePath,
    fsImpl,
    rootDir,
  });

  return resolvedEnvFile
    ? path.relative(rootDir, resolvedEnvFile) || '.env.local'
    : undefined;
}

function createSupabaseOriginEntry({ effective = true, key, source, value }) {
  return {
    classification: classifySupabaseOrigin(value),
    effective,
    key,
    source: source ?? 'missing',
  };
}

function getDockerWebSupabaseOriginReport({
  baseEnv = process.env,
  composeEnv,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const envData = parseWebEnvFilesWithSources({
    envFilePath,
    fsImpl,
    rootDir,
  });
  const effectiveEnvFileSource = getEffectiveEnvFileSource({
    envFilePath,
    fsImpl,
    rootDir,
  });
  const envFileAllowLocal =
    envData.sources[DOCKER_WEB_ALLOW_LOCAL_SUPABASE_ENV] ===
    effectiveEnvFileSource
      ? envData.values[DOCKER_WEB_ALLOW_LOCAL_SUPABASE_ENV]
      : undefined;
  const nextPublicCandidate = getFirstEnvCandidate([
    getEnvCandidate({
      baseEnv,
      envData,
      key: 'NEXT_PUBLIC_SUPABASE_URL',
    }),
  ]);
  const serverCandidate = getFirstEnvCandidate([
    getEnvCandidate({
      baseEnv: {},
      envData,
      key: 'SUPABASE_SERVER_URL',
    }),
    getEnvCandidate({
      baseEnv,
      envData: { sources: {}, values: {} },
      key: 'SUPABASE_SERVER_URL',
    }),
    getEnvCandidate({
      baseEnv,
      envData: { sources: {}, values: {} },
      key: 'DOCKER_INTERNAL_SUPABASE_URL',
    }),
    nextPublicCandidate,
  ]);
  const effectiveServerUrl =
    composeEnv?.SUPABASE_SERVER_URL ??
    rewriteLocalhostUrl(serverCandidate?.value);
  const effectiveServerSource = serverCandidate
    ? serverCandidate.source
    : 'missing';
  const effectiveServerSourceKey = serverCandidate?.key;
  const supabaseUrlCandidate = getFirstEnvCandidate([
    getEnvCandidate({
      baseEnv,
      envData,
      key: 'SUPABASE_URL',
    }),
  ]);
  const dockerInternalCandidate = getFirstEnvCandidate([
    getEnvCandidate({
      baseEnv,
      envData,
      key: 'DOCKER_INTERNAL_SUPABASE_URL',
    }),
  ]);

  return {
    allowLocal: isTruthyEnvValue(
      composeEnv?.[DOCKER_WEB_ALLOW_LOCAL_SUPABASE_ENV] ??
        envFileAllowLocal ??
        baseEnv[DOCKER_WEB_ALLOW_LOCAL_SUPABASE_ENV]
    ),
    entries: [
      createSupabaseOriginEntry({
        key: 'NEXT_PUBLIC_SUPABASE_URL',
        source: nextPublicCandidate?.source,
        value: nextPublicCandidate?.value,
      }),
      createSupabaseOriginEntry({
        key: 'SUPABASE_SERVER_URL',
        source: effectiveServerSource,
        value: effectiveServerUrl,
      }),
      createSupabaseOriginEntry({
        key: 'SUPABASE_URL',
        source: effectiveServerUrl
          ? effectiveServerSource
          : supabaseUrlCandidate?.source,
        value:
          composeEnv?.SUPABASE_URL ??
          effectiveServerUrl ??
          supabaseUrlCandidate?.value,
      }),
      createSupabaseOriginEntry({
        effective: effectiveServerSourceKey === 'DOCKER_INTERNAL_SUPABASE_URL',
        key: 'DOCKER_INTERNAL_SUPABASE_URL',
        source: dockerInternalCandidate?.source,
        value: dockerInternalCandidate?.value,
      }),
    ],
  };
}

function formatSupabaseOriginReport(report) {
  return report.entries
    .filter((entry) => SUPABASE_ORIGIN_KEYS.includes(entry.key))
    .map((entry) => {
      const ignored = entry.effective
        ? ''
        : ', ignored by resolved runtime env';
      return `${entry.key}: ${entry.classification} (${entry.source}${ignored})`;
    })
    .join('; ');
}

function ensureProductionSupabaseOrigin({
  baseEnv = process.env,
  composeEnv,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const report = getDockerWebSupabaseOriginReport({
    baseEnv,
    composeEnv,
    envFilePath,
    fsImpl,
    rootDir,
  });

  if (report.allowLocal) {
    return report;
  }

  const violations = report.entries.filter(
    (entry) =>
      entry.effective &&
      (entry.classification === 'local' || entry.classification === 'invalid')
  );

  if (violations.length === 0) {
    return report;
  }

  const classifications = formatSupabaseOriginReport(report);

  throw new Error(
    [
      'Refusing to run production Docker web with a local Supabase origin.',
      `Resolved Supabase origins: ${classifications}.`,
      '`ttr box setup` writes local Supabase values into apps/web/.env.local; production watchers must use root .env.local or another deployment env file with cloud Supabase values.',
      `Set ${DOCKER_WEB_ALLOW_LOCAL_SUPABASE_ENV}=1 only for a local production-image rehearsal.`,
    ].join(' ')
  );
}

function getFirstNonBlank(values) {
  return values.find(
    (value) => typeof value === 'string' && value.trim().length > 0
  );
}

function getDefaultComposeProjectName(rootDir = ROOT_DIR) {
  const workspaceName = path.basename(rootDir);

  return workspaceName === LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME
    ? DEFAULT_DOCKER_WEB_COMPOSE_PROJECT_NAME
    : workspaceName;
}

function getDockerWebComposeProjectName({
  baseEnv = process.env,
  rootDir = ROOT_DIR,
} = {}) {
  const explicitProjectName = getFirstNonBlank([
    baseEnv.DOCKER_WEB_COMPOSE_PROJECT_NAME,
  ]);

  if (explicitProjectName) {
    return explicitProjectName.trim();
  }

  const inheritedProjectName = getFirstNonBlank([baseEnv.COMPOSE_PROJECT_NAME]);
  const workspaceName = path.basename(rootDir);

  if (
    workspaceName === LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME &&
    inheritedProjectName?.trim() === LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME
  ) {
    return LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME;
  }

  return getDefaultComposeProjectName(rootDir);
}

function getComposeEnvironment({
  baseEnv = process.env,
  envFilePath,
  fsImpl = fs,
  preferEnvFilePath = false,
  rootDir = ROOT_DIR,
  withCloudflared = false,
  withSupportServices = false,
  withRedis = true,
} = {}) {
  const resolvedEnvFilePath = envFilePath ?? path.join(rootDir, '.env.local');
  const envFile = parseWebEnvFiles({
    envFilePath: resolvedEnvFilePath,
    fsImpl,
    rootDir,
  });
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
    BUILDX_NO_DEFAULT_ATTESTATIONS:
      baseEnv.BUILDX_NO_DEFAULT_ATTESTATIONS ?? '1',
    COMPOSE_DOCKER_CLI_BUILD: baseEnv.COMPOSE_DOCKER_CLI_BUILD ?? '1',
    COMPOSE_PROJECT_NAME: getDockerWebComposeProjectName({ baseEnv, rootDir }),
    DOCKER_BUILDKIT: baseEnv.DOCKER_BUILDKIT ?? '1',
  };
  const composeEnvFileValues = getComposeFragmentEnvFileValues({
    envFilePath: resolvedEnvFilePath,
    fsImpl,
    rootDir,
  });
  const dockerWebEnvFile = getComposeEnvFileValue({
    envFilePath: resolvedEnvFilePath,
    fsImpl,
    rootDir,
  });
  composeEnv.DOCKER_WEB_ENV_FILE = preferEnvFilePath
    ? (dockerWebEnvFile ?? baseEnv.DOCKER_WEB_ENV_FILE)
    : (baseEnv.DOCKER_WEB_ENV_FILE ?? dockerWebEnvFile);
  composeEnv.DOCKER_WEB_COMPOSE_ENV_FILE = preferEnvFilePath
    ? (composeEnvFileValues.envFile ?? baseEnv.DOCKER_WEB_COMPOSE_ENV_FILE)
    : (baseEnv.DOCKER_WEB_COMPOSE_ENV_FILE ?? composeEnvFileValues.envFile);
  composeEnv.DOCKER_WEB_COMPOSE_LEGACY_ENV_FILE = preferEnvFilePath
    ? (composeEnvFileValues.legacyEnvFile ??
      baseEnv.DOCKER_WEB_COMPOSE_LEGACY_ENV_FILE)
    : (baseEnv.DOCKER_WEB_COMPOSE_LEGACY_ENV_FILE ??
      composeEnvFileValues.legacyEnvFile);
  composeEnv.DOCKER_WEB_NEXT_PRIVATE_ORIGIN =
    getFirstNonBlank([
      baseEnv.DOCKER_WEB_NEXT_PRIVATE_ORIGIN,
      envFile.DOCKER_WEB_NEXT_PRIVATE_ORIGIN,
    ]) ?? DOCKER_WEB_NEXT_PRIVATE_ORIGIN;
  const dockerWebFrontend = preferEnvFilePath
    ? getFirstNonBlank([
        envFile.DOCKER_WEB_FRONTEND,
        baseEnv.DOCKER_WEB_FRONTEND,
      ])
    : getFirstNonBlank([
        baseEnv.DOCKER_WEB_FRONTEND,
        envFile.DOCKER_WEB_FRONTEND,
      ]);

  if (dockerWebFrontend) {
    composeEnv.DOCKER_WEB_FRONTEND = dockerWebFrontend.trim();
  }

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

  if (withCloudflared) {
    const cloudflaredRuntime = getDockerCloudflaredRuntime({
      baseEnv,
      envFile,
    });

    if (cloudflaredRuntime.token) {
      composeEnv.CLOUDFLARED_TOKEN = cloudflaredRuntime.token;
    }

    composeEnv.DOCKER_WEB_WITH_CLOUDFLARED = '1';
  }

  if (withSupportServices) {
    const dockerBackendRuntime = getDockerBackendRuntime({
      baseEnv,
      fsImpl,
      rootDir,
    });
    composeEnv.BACKEND_INTERNAL_TOKEN = dockerBackendRuntime.token;
    composeEnv.BACKEND_INTERNAL_URL = dockerBackendRuntime.url;

    const dockerCronRuntime = getDockerCronRuntime({
      baseEnv,
      fsImpl,
      rootDir,
    });
    composeEnv.CRON_SECRET = dockerCronRuntime.secret;

    const dockerControlRuntime = getDockerControlRuntime({
      baseEnv,
      fsImpl,
      rootDir,
    });
    composeEnv.PLATFORM_DOCKER_CONTROL_TOKEN = dockerControlRuntime.token;
    composeEnv.PLATFORM_DOCKER_CONTROL_URL = dockerControlRuntime.url;

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
    composeEnv.VALSEA_PRONUNCIATION_ASSESSOR_URL =
      getFirstNonBlank([
        baseEnv.DOCKER_VALSEA_PRONUNCIATION_ASSESSOR_URL,
        baseEnv.VALSEA_PRONUNCIATION_ASSESSOR_URL,
      ]) ?? DOCKER_PRONUNCIATION_ASSESSOR_URL;
    composeEnv.INTERNAL_WEB_API_ORIGIN =
      getFirstNonBlank([
        baseEnv.DOCKER_INTERNAL_WEB_API_ORIGIN,
        baseEnv.INTERNAL_WEB_API_ORIGIN,
      ]) ?? 'http://web-proxy:7803';
  }

  const dockerSupermemoryRuntime = getDockerSupermemoryRuntime({
    baseEnv,
    envFile,
    fsImpl,
    rootDir,
  });
  composeEnv.BETTER_AUTH_SECRET = dockerSupermemoryRuntime.betterAuthSecret;
  composeEnv.SUPERMEMORY_API_KEY = dockerSupermemoryRuntime.apiKey;
  composeEnv.SUPERMEMORY_BASE_URL = dockerSupermemoryRuntime.baseUrl;
  composeEnv.SUPERMEMORY_DATABASE_URL = dockerSupermemoryRuntime.databaseUrl;
  composeEnv.SUPERMEMORY_ENABLED = dockerSupermemoryRuntime.enabled;
  composeEnv.SUPERMEMORY_FAIL_OPEN = dockerSupermemoryRuntime.failOpen;
  composeEnv.SUPERMEMORY_POSTGRES_PASSWORD =
    dockerSupermemoryRuntime.postgresPassword;
  composeEnv.SUPERMEMORY_TIMEOUT_MS = dockerSupermemoryRuntime.timeoutMs;

  return composeEnv;
}

function ensureRequiredComposeEnvironment(
  composeEnv,
  { withCloudflared = false, withRedis = true } = {}
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

  if (
    withCloudflared &&
    (typeof composeEnv.CLOUDFLARED_TOKEN !== 'string' ||
      composeEnv.CLOUDFLARED_TOKEN.trim().length === 0)
  ) {
    missing.push('CLOUDFLARED_TOKEN');
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required Docker runtime env: ${missing.join(', ')}`
    );
  }
}

function ensureWebEnvFile(fsImpl = fs, envFilePath, rootDir = ROOT_DIR) {
  const resolvedEnvFilePath = envFilePath ?? path.join(rootDir, '.env.local');

  if (
    resolveWebEnvFile({ envFilePath: resolvedEnvFilePath, fsImpl, rootDir })
  ) {
    return;
  }

  const candidates = getWebEnvFileCandidates({
    envFilePath: resolvedEnvFilePath,
    rootDir,
  })
    .slice()
    .reverse()
    .map(
      (candidatePath) => path.relative(rootDir, candidatePath) || '.env.local'
    )
    .join(' or ');

  throw new Error(`Missing required env file: ${candidates}`);
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
    backendTokenFile: path.join(rootDir, 'tmp', 'docker-web', 'backend-token'),
    cronTokenFile: path.join(rootDir, 'tmp', 'docker-web', 'cron-token'),
    dockerControlTokenFile: path.join(
      rootDir,
      'tmp',
      'docker-web',
      'docker-control-token'
    ),
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
    supermemoryApiKeyFile: path.join(
      rootDir,
      'tmp',
      'docker-web',
      'supermemory-api-key'
    ),
    supermemoryBetterAuthSecretFile: path.join(
      rootDir,
      'tmp',
      'docker-web',
      'supermemory-better-auth-secret'
    ),
    supermemoryPostgresPasswordFile: path.join(
      rootDir,
      'tmp',
      'docker-web',
      'supermemory-postgres-password'
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

function resolveDockerRuntimeSecret({
  candidateValues,
  fsImpl = fs,
  paths = getDockerWebRuntimePaths(),
  tokenFile,
}) {
  const explicitSecret = getFirstNonBlank(candidateValues);

  if (explicitSecret) {
    return explicitSecret;
  }

  const persistedSecret = getPersistedDockerToken(tokenFile, fsImpl);

  if (persistedSecret) {
    return persistedSecret;
  }

  const generatedSecret = generateDockerServiceToken();
  writeDockerToken(generatedSecret, tokenFile, paths, fsImpl);
  return generatedSecret;
}

function getDockerSupermemoryRuntime({
  baseEnv = process.env,
  envFile = {},
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const paths = getDockerWebRuntimePaths(rootDir);
  const apiKey = resolveDockerRuntimeSecret({
    candidateValues: [
      baseEnv.DOCKER_SUPERMEMORY_API_KEY,
      baseEnv.SUPERMEMORY_API_KEY,
      envFile.DOCKER_SUPERMEMORY_API_KEY,
      envFile.SUPERMEMORY_API_KEY,
    ],
    fsImpl,
    paths,
    tokenFile: paths.supermemoryApiKeyFile,
  });
  const betterAuthSecret = resolveDockerRuntimeSecret({
    candidateValues: [
      baseEnv.DOCKER_SUPERMEMORY_BETTER_AUTH_SECRET,
      baseEnv.BETTER_AUTH_SECRET,
      envFile.DOCKER_SUPERMEMORY_BETTER_AUTH_SECRET,
      envFile.BETTER_AUTH_SECRET,
    ],
    fsImpl,
    paths,
    tokenFile: paths.supermemoryBetterAuthSecretFile,
  });
  const postgresPassword = resolveDockerRuntimeSecret({
    candidateValues: [
      baseEnv.DOCKER_SUPERMEMORY_POSTGRES_PASSWORD,
      baseEnv.SUPERMEMORY_POSTGRES_PASSWORD,
      envFile.DOCKER_SUPERMEMORY_POSTGRES_PASSWORD,
      envFile.SUPERMEMORY_POSTGRES_PASSWORD,
    ],
    fsImpl,
    paths,
    tokenFile: paths.supermemoryPostgresPasswordFile,
  });
  const encodedPostgresPassword = encodeURIComponent(postgresPassword);
  const defaultDatabaseUrl = `postgres://${DOCKER_SUPERMEMORY_DATABASE_USER}:${encodedPostgresPassword}@${DOCKER_SUPERMEMORY_DATABASE_HOST}:5432/${DOCKER_SUPERMEMORY_DATABASE_NAME}`;

  return {
    apiKey,
    baseUrl:
      getFirstNonBlank([
        baseEnv.DOCKER_SUPERMEMORY_BASE_URL,
        baseEnv.SUPERMEMORY_BASE_URL,
        envFile.DOCKER_SUPERMEMORY_BASE_URL,
        envFile.SUPERMEMORY_BASE_URL,
      ]) ?? DOCKER_SUPERMEMORY_BASE_URL,
    betterAuthSecret,
    databaseUrl:
      getFirstNonBlank([
        baseEnv.DOCKER_SUPERMEMORY_DATABASE_URL,
        baseEnv.SUPERMEMORY_DATABASE_URL,
        envFile.DOCKER_SUPERMEMORY_DATABASE_URL,
        envFile.SUPERMEMORY_DATABASE_URL,
      ]) ?? defaultDatabaseUrl,
    enabled:
      getFirstNonBlank([
        baseEnv.DOCKER_SUPERMEMORY_ENABLED,
        baseEnv.SUPERMEMORY_ENABLED,
        envFile.DOCKER_SUPERMEMORY_ENABLED,
        envFile.SUPERMEMORY_ENABLED,
      ]) ?? 'true',
    failOpen:
      getFirstNonBlank([
        baseEnv.DOCKER_SUPERMEMORY_FAIL_OPEN,
        baseEnv.SUPERMEMORY_FAIL_OPEN,
        envFile.DOCKER_SUPERMEMORY_FAIL_OPEN,
        envFile.SUPERMEMORY_FAIL_OPEN,
      ]) ?? 'true',
    postgresPassword,
    timeoutMs:
      getFirstNonBlank([
        baseEnv.DOCKER_SUPERMEMORY_TIMEOUT_MS,
        baseEnv.SUPERMEMORY_TIMEOUT_MS,
        envFile.DOCKER_SUPERMEMORY_TIMEOUT_MS,
        envFile.SUPERMEMORY_TIMEOUT_MS,
      ]) ?? '1500',
  };
}

function getDockerRedisRuntime({
  baseEnv = process.env,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const envToken = getFirstNonBlank([baseEnv.DOCKER_UPSTASH_REDIS_REST_TOKEN]);
  const envUrl = getFirstNonBlank([baseEnv.DOCKER_UPSTASH_REDIS_REST_URL]);
  const token =
    envToken ??
    getPersistedDockerRedisToken(getDockerWebRuntimePaths(rootDir), fsImpl) ??
    generateDockerRedisToken();

  if (token !== baseEnv.DOCKER_UPSTASH_REDIS_REST_TOKEN) {
    writeDockerRedisToken(token, getDockerWebRuntimePaths(rootDir), fsImpl);
  }

  return {
    token,
    url: envUrl ?? DOCKER_REDIS_SERVICE_URL,
  };
}

function getDockerCloudflaredRuntime({
  baseEnv = process.env,
  envFile = {},
} = {}) {
  return {
    token: getFirstNonBlank([
      ...CLOUDFLARED_TOKEN_KEYS.map((key) => baseEnv[key]),
      ...CLOUDFLARED_TOKEN_KEYS.map((key) => envFile[key]),
    ]),
  };
}

function getDockerCloudflaredAutodetectEnvFile({
  envFilePath,
  rootDir = ROOT_DIR,
} = {}) {
  const rootEnvFile = path.join(rootDir, '.env.local');

  if (envFilePath && path.resolve(envFilePath) !== path.resolve(rootEnvFile)) {
    return envFilePath;
  }

  return rootEnvFile;
}

function getDockerCloudflaredAutodetect({
  baseEnv = process.env,
  envFilePath,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  if (isFalseyEnvValue(baseEnv.DOCKER_WEB_WITH_CLOUDFLARED)) {
    return {
      enabled: false,
      token: null,
    };
  }

  const envFile = parseEnvFile(
    getDockerCloudflaredAutodetectEnvFile({ envFilePath, rootDir }),
    fsImpl
  );
  const triggerToken = getFirstNonBlank([
    baseEnv.CF_TUNNEL_TOKEN,
    envFile.CF_TUNNEL_TOKEN,
  ]);
  const token = getDockerCloudflaredRuntime({ baseEnv, envFile }).token;

  return {
    enabled: typeof triggerToken === 'string' && triggerToken.trim().length > 0,
    token: token ?? null,
  };
}

function getDockerCronRuntime({
  baseEnv = process.env,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const paths = getDockerWebRuntimePaths(rootDir);
  const envSecret = getFirstNonBlank([
    baseEnv.DOCKER_CRON_SECRET,
    baseEnv.CRON_SECRET,
    baseEnv.VERCEL_CRON_SECRET,
  ]);
  const secret =
    envSecret ??
    getPersistedDockerToken(paths.cronTokenFile, fsImpl) ??
    generateDockerServiceToken();

  if (secret !== envSecret) {
    writeDockerToken(secret, paths.cronTokenFile, paths, fsImpl);
  }

  return { secret };
}

function getDockerControlRuntime({
  baseEnv = process.env,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const paths = getDockerWebRuntimePaths(rootDir);
  const envToken = getFirstNonBlank([
    baseEnv.DOCKER_PLATFORM_DOCKER_CONTROL_TOKEN,
    baseEnv.PLATFORM_DOCKER_CONTROL_TOKEN,
  ]);
  const token =
    envToken ??
    getPersistedDockerToken(paths.dockerControlTokenFile, fsImpl) ??
    generateDockerServiceToken();

  if (token !== envToken) {
    writeDockerToken(token, paths.dockerControlTokenFile, paths, fsImpl);
  }

  return {
    token,
    url:
      getFirstNonBlank([
        baseEnv.DOCKER_PLATFORM_DOCKER_CONTROL_URL,
        baseEnv.PLATFORM_DOCKER_CONTROL_URL,
      ]) ?? DOCKER_CONTROL_INTERNAL_URL,
  };
}

function getDockerBackendRuntime({
  baseEnv = process.env,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const paths = getDockerWebRuntimePaths(rootDir);
  const envToken = getFirstNonBlank([
    baseEnv.DOCKER_BACKEND_INTERNAL_TOKEN,
    baseEnv.BACKEND_INTERNAL_TOKEN,
  ]);
  const token =
    envToken ??
    getPersistedDockerToken(paths.backendTokenFile, fsImpl) ??
    generateDockerServiceToken();

  if (token !== envToken) {
    writeDockerToken(token, paths.backendTokenFile, paths, fsImpl);
  }

  return {
    token,
    url:
      getFirstNonBlank([
        baseEnv.DOCKER_BACKEND_INTERNAL_URL,
        baseEnv.BACKEND_INTERNAL_URL,
      ]) ?? DOCKER_BACKEND_INTERNAL_URL,
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
  DEFAULT_DOCKER_WEB_COMPOSE_PROJECT_NAME,
  DOCKER_BACKEND_INTERNAL_URL,
  DOCKER_CONTROL_INTERNAL_URL,
  DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT_ENV,
  DOCKER_WEB_NEXT_PRIVATE_ORIGIN,
  DOCKER_MARKITDOWN_ENDPOINT_URL,
  DOCKER_MARKITDOWN_SERVICE_URL,
  DOCKER_PRONUNCIATION_ASSESSOR_URL,
  DOCKER_REDIS_SERVICE_URL,
  DOCKER_STORAGE_UNZIP_PROXY_URL,
  DOCKER_WEB_BACKEND_TOKEN_FILE,
  DOCKER_WEB_CRON_TOKEN_FILE,
  DOCKER_WEB_DOCKER_CONTROL_TOKEN_FILE,
  DOCKER_WEB_GIT_COMMON_DIR_ENV,
  DOCKER_WEB_MARKITDOWN_TOKEN_FILE,
  DOCKER_WEB_ALLOW_LOCAL_SUPABASE_ENV,
  DOCKER_WEB_REDIS_TOKEN_FILE,
  DOCKER_WEB_RUNTIME_DIR,
  DOCKER_WEB_STORAGE_UNZIP_TOKEN_FILE,
  DOCKER_WEB_SUPERMEMORY_API_KEY_FILE,
  DOCKER_WEB_SUPERMEMORY_BETTER_AUTH_SECRET_FILE,
  DOCKER_WEB_SUPERMEMORY_POSTGRES_PASSWORD_FILE,
  DOCKER_HOST_ALIAS,
  DOCKER_SUPERMEMORY_BASE_URL,
  GIT_LOCAL_ENV_KEYS,
  LEGACY_WEB_ENV_FILE,
  LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME,
  WEB_ENV_FILE,
  ensureProductionRedisToken,
  ensureProductionSupabaseOrigin,
  ensureRequiredComposeEnvironment,
  ensureDockerWebRuntime,
  ensureWebEnvFile,
  classifySupabaseOrigin,
  generateDockerRedisToken,
  generateDockerServiceToken,
  getComposeEnvironment,
  getComposeFragmentEnvFileValue,
  getComposeFragmentEnvFileValues,
  getDefaultComposeProjectName,
  getDockerWebComposeProjectName,
  getDockerBackendRuntime,
  getDockerCloudflaredAutodetect,
  getDockerCloudflaredRuntime,
  getDockerCronRuntime,
  getDockerControlRuntime,
  getDockerMarkitdownRuntime,
  getDockerRedisRuntime,
  getDockerSupermemoryRuntime,
  getDockerStorageUnzipRuntime,
  getDockerWebRuntimePaths,
  getDockerWebSupabaseOriginReport,
  getWebEnvFileCandidates,
  getPersistedDockerRedisToken,
  parseEnvFile,
  parseWebEnvFilesWithSources,
  parseWebEnvFiles,
  resolveLinkedWorktreeGitCommonDir,
  resolveWebEnvFile,
  rewriteLocalhostUrl,
  sanitizeGitLocalEnv,
  formatSupabaseOriginReport,
  stripUnquotedInlineComment,
  writeDockerRedisToken,
};
