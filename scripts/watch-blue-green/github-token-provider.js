const fs = require('node:fs');
const path = require('node:path');

const { getWatchPaths } = require('./paths.js');

const GITHUB_CHECKS_TOKEN_ENV = 'TUTURUUU_CI_GITHUB_TOKEN';
const GITHUB_CHECKS_TOKEN_URL_ENV = 'TUTURUUU_CI_GITHUB_TOKEN_URL';
const GITHUB_CHECKS_TOKEN_CLIENT_TOKEN_ENV =
  'TUTURUUU_CI_GITHUB_TOKEN_CLIENT_TOKEN';
const GITHUB_CHECKS_TOKEN_AUTO_DISCOVERY_ENV =
  'TUTURUUU_CI_GITHUB_TOKEN_AUTO_DISCOVERY';
const GITHUB_TOKEN_ENV = 'GITHUB_TOKEN';
const GITHUB_BOT_RUNTIME_KIND = 'tuturuuu-github-bot-runtime-token';
const GITHUB_BOT_RUNTIME_REQUEST_KIND =
  'tuturuuu-github-bot-runtime-credential';
const GENERATED_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

function trimString(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeTokenEndpointUrl(value) {
  const text = trimString(value);

  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function isAutoDiscoveryDisabled(env = process.env) {
  const value = trimString(env?.[GITHUB_CHECKS_TOKEN_AUTO_DISCOVERY_ENV]);
  return value === '0' || value?.toLowerCase() === 'false';
}

function getGitHubChecksToken(env = process.env) {
  return (
    trimString(env?.[GITHUB_CHECKS_TOKEN_ENV]) ??
    trimString(env?.[GITHUB_TOKEN_ENV])
  );
}

function readJsonFile(filePath, fsImpl = fs) {
  if (!filePath || !fsImpl.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function parseExpiry(value) {
  const expiresAtMs = Date.parse(value);
  return Number.isFinite(expiresAtMs) ? expiresAtMs : null;
}

function normalizeRepository(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const owner = trimString(value.owner);
  const name = trimString(value.name);

  return owner && name ? { name, owner } : null;
}

function normalizeRuntimeCredential(value, { nowMs = Date.now() } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  if (
    value.kind !== GITHUB_BOT_RUNTIME_KIND &&
    value.kind !== GITHUB_BOT_RUNTIME_REQUEST_KIND
  ) {
    return null;
  }

  const tokenUrl = normalizeTokenEndpointUrl(value.tokenUrl);
  const clientToken = trimString(value.clientToken);
  const expiresAt = trimString(value.expiresAt);
  const expiresAtMs = expiresAt ? parseExpiry(expiresAt) : null;

  if (!tokenUrl || !clientToken || !expiresAt || expiresAtMs === null) {
    return null;
  }

  if (expiresAtMs <= nowMs) {
    return null;
  }

  return {
    clientId: trimString(value.clientId),
    clientToken,
    createdAt: trimString(value.createdAt),
    expiresAt,
    kind: GITHUB_BOT_RUNTIME_KIND,
    repository: normalizeRepository(value.repository),
    tokenUrl,
    updatedAt: new Date(nowMs).toISOString(),
  };
}

function writeRuntimeCredential(filePath, credential, fsImpl = fs) {
  if (!filePath) {
    return;
  }

  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  fsImpl.writeFileSync(filePath, JSON.stringify(credential, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function removeFile(filePath, fsImpl = fs) {
  if (!filePath) {
    return;
  }

  if (typeof fsImpl.rmSync === 'function') {
    fsImpl.rmSync(filePath, { force: true });
    return;
  }

  if (fsImpl.existsSync(filePath) && typeof fsImpl.unlinkSync === 'function') {
    fsImpl.unlinkSync(filePath);
  }
}

function consumeGitHubBotRuntimeRequest({
  fsImpl = fs,
  nowMs = Date.now(),
  paths = getWatchPaths(),
} = {}) {
  const requestFile = paths?.githubBotRuntimeRequestFile;
  const runtimeFile = paths?.githubBotRuntimeFile;
  const request = readJsonFile(requestFile, fsImpl);
  const credential = normalizeRuntimeCredential(request, { nowMs });

  if (!credential) {
    return null;
  }

  writeRuntimeCredential(runtimeFile, credential, fsImpl);
  removeFile(requestFile, fsImpl);
  return credential;
}

function getRuntimeGeneratedTokenSource({
  fsImpl = fs,
  nowMs = Date.now(),
  paths = getWatchPaths(),
} = {}) {
  const queuedCredential = consumeGitHubBotRuntimeRequest({
    fsImpl,
    nowMs,
    paths,
  });
  const credential =
    queuedCredential ??
    normalizeRuntimeCredential(
      readJsonFile(paths?.githubBotRuntimeFile, fsImpl),
      {
        nowMs,
      }
    );

  if (!credential) {
    return null;
  }

  return {
    clientToken: credential.clientToken,
    source: 'runtime',
    tokenUrl: credential.tokenUrl,
    type: 'generated',
  };
}

function getGitHubChecksTokenSource(
  env = process.env,
  { fsImpl = fs, now = () => Date.now(), paths = getWatchPaths() } = {}
) {
  const explicitStaticToken = trimString(env?.[GITHUB_CHECKS_TOKEN_ENV]);
  if (explicitStaticToken) {
    return {
      envName: GITHUB_CHECKS_TOKEN_ENV,
      token: explicitStaticToken,
      type: 'static',
    };
  }

  const tokenUrl = normalizeTokenEndpointUrl(
    env?.[GITHUB_CHECKS_TOKEN_URL_ENV]
  );
  const clientToken = trimString(env?.[GITHUB_CHECKS_TOKEN_CLIENT_TOKEN_ENV]);
  if (tokenUrl && clientToken) {
    return {
      clientToken,
      source: 'env',
      tokenUrl,
      type: 'generated',
    };
  }

  if (!isAutoDiscoveryDisabled(env)) {
    const runtimeSource = getRuntimeGeneratedTokenSource({
      fsImpl,
      nowMs: now(),
      paths,
    });

    if (runtimeSource) {
      return runtimeSource;
    }
  }

  const fallbackStaticToken = trimString(env?.[GITHUB_TOKEN_ENV]);
  if (fallbackStaticToken) {
    return {
      envName: GITHUB_TOKEN_ENV,
      token: fallbackStaticToken,
      type: 'static',
    };
  }

  return null;
}

function assertFetchAvailable(fetchImpl) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('GitHub token endpoint fetch is unavailable');
  }
}

function isCachedTokenFresh(cachedToken, nowMs) {
  const expiresAtMs = cachedToken ? parseExpiry(cachedToken.expiresAt) : null;
  return (
    typeof cachedToken?.token === 'string' &&
    cachedToken.token.length > 0 &&
    expiresAtMs !== null &&
    expiresAtMs - GENERATED_TOKEN_REFRESH_SKEW_MS > nowMs
  );
}

function createGitHubChecksTokenProvider({
  env = process.env,
  fetchImpl = globalThis.fetch,
  fsImpl = fs,
  now = () => Date.now(),
  paths = getWatchPaths(),
} = {}) {
  let cachedGeneratedToken = null;

  async function fetchGeneratedToken(source) {
    assertFetchAvailable(fetchImpl);

    const response = await fetchImpl(source.tokenUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${source.clientToken}`,
        'Cache-Control': 'no-store',
      },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(
        `GitHub token endpoint failed with status ${response.status}`
      );
    }

    const payload = await response.json();
    const token = trimString(payload?.token);
    const expiresAt = trimString(payload?.expiresAt);

    if (!token || !expiresAt || parseExpiry(expiresAt) === null) {
      throw new Error('GitHub token endpoint returned an invalid payload');
    }

    cachedGeneratedToken = { expiresAt, token };
    return token;
  }

  return {
    async forceRefresh() {
      const source = getGitHubChecksTokenSource(env, { fsImpl, now, paths });

      if (!source) {
        return null;
      }

      if (source.type === 'static') {
        return source.token;
      }

      cachedGeneratedToken = null;
      return fetchGeneratedToken(source);
    },
    async getToken() {
      const source = getGitHubChecksTokenSource(env, { fsImpl, now, paths });

      if (!source) {
        return null;
      }

      if (source.type === 'static') {
        return source.token;
      }

      if (isCachedTokenFresh(cachedGeneratedToken, now())) {
        return cachedGeneratedToken.token;
      }

      return fetchGeneratedToken(source);
    },
    getTokenSource() {
      const source = getGitHubChecksTokenSource(env, { fsImpl, now, paths });
      if (!source) {
        return null;
      }

      return source.type === 'static'
        ? { envName: source.envName, type: source.type }
        : { source: source.source, type: source.type };
    },
  };
}

module.exports = {
  GENERATED_TOKEN_REFRESH_SKEW_MS,
  GITHUB_BOT_RUNTIME_KIND,
  GITHUB_BOT_RUNTIME_REQUEST_KIND,
  GITHUB_CHECKS_TOKEN_AUTO_DISCOVERY_ENV,
  GITHUB_CHECKS_TOKEN_CLIENT_TOKEN_ENV,
  GITHUB_CHECKS_TOKEN_ENV,
  GITHUB_CHECKS_TOKEN_URL_ENV,
  createGitHubChecksTokenProvider,
  consumeGitHubBotRuntimeRequest,
  getGitHubChecksToken,
  getGitHubChecksTokenSource,
  normalizeRuntimeCredential,
};
