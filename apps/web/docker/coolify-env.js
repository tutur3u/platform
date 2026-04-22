const COOLIFY_ENV_KEYS = ['COOLIFY_URL', 'COOLIFY_FQDN'];
const APP_URL_ENV_KEYS = [
  'WEB_APP_URL',
  'NEXT_PUBLIC_WEB_APP_URL',
  'NEXT_PUBLIC_APP_URL',
];

function getFirstEnvValue(rawValue) {
  if (typeof rawValue !== 'string') {
    return null;
  }

  for (const value of rawValue.split(/[,\n]/u)) {
    const trimmed = value.trim();

    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function resolveConfiguredOrigin(rawValue) {
  const value = getFirstEnvValue(rawValue);

  if (!value) {
    return null;
  }

  const normalized = /^[a-z]+:\/\//iu.test(value) ? value : `https://${value}`;

  try {
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

function resolveCoolifyOrigin(env = process.env) {
  for (const key of COOLIFY_ENV_KEYS) {
    const origin = resolveConfiguredOrigin(env[key]);

    if (origin) {
      return origin;
    }
  }

  return null;
}

function applyCoolifyAppUrlFallbacks(env = process.env) {
  const coolifyOrigin = resolveCoolifyOrigin(env);

  if (!coolifyOrigin) {
    return env;
  }

  for (const key of APP_URL_ENV_KEYS) {
    if (typeof env[key] !== 'string' || env[key].trim().length === 0) {
      env[key] = coolifyOrigin;
    }
  }

  return env;
}

module.exports = {
  APP_URL_ENV_KEYS,
  COOLIFY_ENV_KEYS,
  applyCoolifyAppUrlFallbacks,
  getFirstEnvValue,
  resolveConfiguredOrigin,
  resolveCoolifyOrigin,
};
