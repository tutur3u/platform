import { pathToFileURL } from 'node:url';

const DEFAULT_BACKEND_INTERNAL_URL = 'http://backend:7820';
const DEFAULT_TANSTACK_WEB_PORT = '7824';
const HEALTHCHECK_TIMEOUT_MS = 4000;

function firstConfiguredValue(value) {
  return value
    ?.split(/[,\n]/u)
    .map((entry) => entry.trim())
    .find(Boolean);
}

function normalizeOrigin(value, fallback) {
  const configured = firstConfiguredValue(value) ?? fallback;
  const normalized = /^[a-z][a-z\d+.-]*:\/\//iu.test(configured)
    ? configured
    : `http://${configured}`;
  const url = new URL(normalized);

  return url.origin;
}

function createTimeoutSignal() {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), HEALTHCHECK_TIMEOUT_MS).unref?.();

  return controller.signal;
}

async function drainResponse(response) {
  if (typeof response.arrayBuffer === 'function') {
    await response.arrayBuffer().catch(() => undefined);
  }
}

async function fetchForHealth(fetchImpl, url) {
  return fetchImpl(url, {
    cache: 'no-store',
    signal: createTimeoutSignal(),
  });
}

export function getTanStackRunnerHealthUrl(env = process.env) {
  const port = firstConfiguredValue(env.PORT) ?? DEFAULT_TANSTACK_WEB_PORT;

  return `http://127.0.0.1:${port}/`;
}

export function getBackendHealthUrl(env = process.env) {
  const backendOrigin = normalizeOrigin(
    env.BACKEND_INTERNAL_URL,
    DEFAULT_BACKEND_INTERNAL_URL
  );

  return new URL('/healthz', backendOrigin).toString();
}

export async function runTanStackWebHealthcheck({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const runnerUrl = getTanStackRunnerHealthUrl(env);
  const runnerResponse = await fetchForHealth(fetchImpl, runnerUrl);
  await drainResponse(runnerResponse);

  if (runnerResponse.status >= 500) {
    throw new Error(
      `TanStack runner healthcheck returned HTTP ${runnerResponse.status}.`
    );
  }

  const backendUrl = getBackendHealthUrl(env);
  const backendResponse = await fetchForHealth(fetchImpl, backendUrl);
  await drainResponse(backendResponse);

  if (!backendResponse.ok) {
    throw new Error(
      `Backend healthcheck returned HTTP ${backendResponse.status}.`
    );
  }
}

const executedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (executedPath === import.meta.url) {
  runTanStackWebHealthcheck().catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
