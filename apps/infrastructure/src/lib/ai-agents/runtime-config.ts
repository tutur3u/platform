const LOCAL_HOSTS = new Set([
  '0.0.0.0',
  '127.0.0.1',
  'localhost',
  '::1',
  '[::1]',
]);

type Env = Record<string, string | undefined>;

function firstNonBlank(values: Array<string | null | undefined>) {
  return values.find(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0
  );
}

function parseOrigin(value: string | null | undefined) {
  if (!value?.trim()) return null;

  const [firstValue] = value
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!firstValue) return null;

  const normalized = /^[a-z]+:\/\//iu.test(firstValue)
    ? firstValue
    : `https://${firstValue}`;

  try {
    const parsed = new URL(normalized);
    if (
      parsed.hostname === 'tuturuuu.com' ||
      parsed.hostname.endsWith('.tuturuuu.com')
    ) {
      parsed.protocol = 'https:';
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function isLocalOrigin(origin: string) {
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function isProductionLike(env: Env) {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === 'production';
  return env.NODE_ENV === 'production';
}

export function resolveAiAgentWebhookOrigin({
  env = process.env,
  requestOrigin,
}: {
  env?: Env;
  requestOrigin?: string | null;
} = {}) {
  const configuredOrigin = firstNonBlank([
    parseOrigin(env.AI_AGENT_WEBHOOK_ORIGIN),
    parseOrigin(env.WEB_APP_URL),
    parseOrigin(env.NEXT_PUBLIC_WEB_APP_URL),
    parseOrigin(env.NEXT_PUBLIC_APP_URL),
    parseOrigin(env.PLATFORM_BUILD_DEPLOYMENT_URL),
  ]);

  if (configuredOrigin && !isLocalOrigin(configuredOrigin)) {
    return configuredOrigin;
  }

  if (isProductionLike(env)) {
    return 'https://tuturuuu.com';
  }

  const parsedRequestOrigin = parseOrigin(requestOrigin);
  if (parsedRequestOrigin) {
    if (new URL(parsedRequestOrigin).hostname === '0.0.0.0') {
      return parsedRequestOrigin.replace('://0.0.0.0', '://localhost');
    }
    return parsedRequestOrigin;
  }

  return configuredOrigin || 'https://tuturuuu.localhost';
}

export function resolveAiAgentRedisUrl({
  env = process.env,
  rootSecret,
}: {
  env?: Env;
  rootSecret?: string | null;
} = {}) {
  const explicitUrl = firstNonBlank([
    rootSecret,
    env.AI_AGENT_CHAT_SDK_STATE_REDIS_URL,
    env.REDIS_URL,
    env.DOCKER_WEB_REDIS_URL,
  ])?.trim();

  if (explicitUrl) {
    return explicitUrl;
  }

  const blueGreenRuntimePresent = Boolean(
    firstNonBlank([
      env.PLATFORM_BLUE_GREEN_COLOR,
      env.PLATFORM_BLUE_GREEN_CONTROL_DIR,
      env.PLATFORM_BLUE_GREEN_MONITORING_DIR,
    ])
  );
  const dockerSrhPresent =
    env.UPSTASH_REDIS_REST_URL?.includes('serverless-redis-http') === true;

  if (blueGreenRuntimePresent || dockerSrhPresent) {
    return env.AI_AGENT_BLUE_GREEN_REDIS_URL?.trim() || 'redis://redis:6379';
  }

  return null;
}
