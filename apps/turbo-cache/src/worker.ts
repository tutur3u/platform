import {
  checkUpload,
  HASH,
  MAX_BATCH_HASHES,
  queryArtifacts,
  readArtifact,
  writeArtifact,
} from './artifacts';
import { bearerDigest, findToken, timingSafeEqualHex } from './auth';
import { type OperationClass, admit as reserve } from './budget';
import { readBudget } from './budget-store';
import {
  type CacheConfig,
  type Env,
  readConfig,
  type TokenEntry,
} from './config';

export { TurboCacheBudget } from './budget-object';

const ARTIFACT_PATH = /^\/v8\/artifacts\/([^/]+)$/;
// A short negative cache saves control reads. Correctness across isolates
// comes from the authoritative R2 snapshot, never this optimization.
const DENIAL_MEMO_MS = 60_000;

export interface HandlerState {
  deniedUntil: Partial<Record<OperationClass, number>>;
  now: () => Date;
}

function json(body: unknown, status = 200, extra?: Record<string, string>) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extra },
  });
}

function error(status: number, code: string, extra?: Record<string, string>) {
  return json({ error: { code, message: code } }, status, extra);
}

function budgetStub(env: Env) {
  return env.BUDGET.get(env.BUDGET.idFromName('global'));
}

async function admit(
  env: Env,
  state: HandlerState,
  operation: OperationClass,
  count: number,
  bytes: number
) {
  const now = state.now().getTime();
  if ((state.deniedUntil[operation] ?? 0) > now)
    return { allowed: false, reason: 'paused' };
  try {
    const snapshot = await readBudget(env.ARTIFACTS);
    const preflight = snapshot
      ? reserve(
          snapshot,
          { operation, count, bytes },
          readConfig(env).budget,
          state.now()
        )
      : { allowed: false, reason: 'budget_unavailable' };
    if (!preflight.allowed) {
      state.deniedUntil[operation] = now + DENIAL_MEMO_MS;
      return { allowed: false, reason: preflight.reason };
    }
    const response = await budgetStub(env).fetch('https://budget/admit', {
      method: 'POST',
      body: JSON.stringify({ operation, count, bytes }),
    });
    const result: unknown = await response.json().catch(() => null);
    if (
      response.ok &&
      result &&
      typeof result === 'object' &&
      'allowed' in result &&
      result.allowed === true
    )
      return { allowed: true, reason: undefined };
    state.deniedUntil[operation] = now + DENIAL_MEMO_MS;
    return { allowed: false, reason: 'budget_unavailable' };
  } catch {
    state.deniedUntil[operation] = now + DENIAL_MEMO_MS;
    return { allowed: false, reason: 'budget_unavailable' };
  }
}

async function handleAdmin(request: Request, env: Env, config: CacheConfig) {
  const digest = await bearerDigest(request.headers.get('authorization'));
  if (
    !config.adminSha256 ||
    !digest ||
    !timingSafeEqualHex(digest, config.adminSha256)
  )
    return error(401, 'unauthorized');
  const { pathname } = new URL(request.url);
  if (request.method === 'GET' && pathname === '/admin/budget')
    return budgetStub(env).fetch('https://budget/state');
  if (request.method === 'POST' && pathname === '/admin/fence') {
    return budgetStub(env).fetch('https://budget/fence', {
      method: 'POST',
      body: await request.text(),
    });
  }
  return error(404, 'not_found');
}

async function handleArtifacts(
  request: Request,
  env: Env,
  config: CacheConfig,
  token: TokenEntry,
  state: HandlerState
) {
  const { pathname } = new URL(request.url);
  const method = request.method;

  if (pathname === '/v8/artifacts/status' && method === 'GET') {
    const snapshot = await readBudget(env.ARTIFACTS).catch(() => null);
    const paused =
      !snapshot ||
      !reserve(
        snapshot,
        {
          operation: 'class-b',
          count: token.read.length,
          bytes: 0,
        },
        config.budget,
        state.now()
      ).allowed;
    return json({ status: paused ? 'paused' : 'enabled' });
  }

  if (pathname === '/v8/artifacts/events' && method === 'POST') {
    // Usage analytics are accepted and discarded; they cost no storage ops.
    return json({});
  }

  if (pathname === '/v8/artifacts' && method === 'POST') {
    const body = (await request.json().catch(() => null)) as {
      hashes?: unknown;
    } | null;
    const hashes = body?.hashes;
    if (
      !Array.isArray(hashes) ||
      hashes.length < 1 ||
      hashes.length > MAX_BATCH_HASHES ||
      !hashes.every((hash) => typeof hash === 'string' && HASH.test(hash))
    )
      return error(400, 'invalid_hashes');
    const admission = await admit(
      env,
      state,
      'class-b',
      hashes.length * token.read.length,
      0
    );
    if (!admission.allowed) return error(503, 'cache_paused');
    return json(
      await queryArtifacts(env.ARTIFACTS, token, hashes, config, state.now())
    );
  }

  const match = ARTIFACT_PATH.exec(pathname);
  if (!match) return error(404, 'not_found');
  const hash = match[1];
  if (!HASH.test(hash)) return error(400, 'invalid_hash');

  if (method === 'GET' || method === 'HEAD') {
    const admission = await admit(env, state, 'class-b', token.read.length, 0);
    // A denied read is reported as a miss: Turbo then runs the task, which
    // can only cost time, never return a stale result.
    if (!admission.allowed)
      return error(404, 'not_found', {
        'x-turbo-cache-denied': admission.reason ?? 'paused',
      });
    const found = await readArtifact(
      env.ARTIFACTS,
      token,
      hash,
      config,
      state.now(),
      method
    );
    return found ?? error(404, 'not_found');
  }

  if (method === 'PUT') {
    if (config.mode !== 'read-write' || !token.write)
      return error(403, 'read_only');
    const upload = checkUpload(request, config);
    if (!upload.ok) return error(upload.status, upload.error);
    const admission = await admit(env, state, 'class-a', 1, upload.length);
    if (!admission.allowed)
      return error(503, 'cache_paused', {
        'x-turbo-cache-denied': admission.reason ?? 'paused',
      });
    const stored = await writeArtifact(
      env.ARTIFACTS,
      { ...token, write: token.write },
      hash,
      request,
      upload
    );
    if (!stored) return error(500, 'write_failed');
    return json({ urls: [`${token.write}/${hash}`] }, 202);
  }

  return error(405, 'method_not_allowed');
}

export function createHandler(
  state: HandlerState = { deniedUntil: {}, now: () => new Date() }
) {
  return async function handle(request: Request, env: Env): Promise<Response> {
    const config = readConfig(env);
    const { pathname } = new URL(request.url);

    if (pathname.startsWith('/admin/'))
      return handleAdmin(request, env, config);
    if (!pathname.startsWith('/v8/artifacts')) return error(404, 'not_found');
    // Default-safe stop: an unset or unknown mode serves nothing and touches
    // no billable storage.
    if (config.mode === 'off') {
      if (pathname === '/v8/artifacts/status')
        return json({ status: 'disabled' });
      return error(503, 'cache_disabled');
    }

    const token = findToken(
      await bearerDigest(request.headers.get('authorization')),
      config.tokens
    );
    if (!token) return error(401, 'unauthorized');

    if (env.REQUEST_LIMITER) {
      const { success } = await env.REQUEST_LIMITER.limit({ key: token.id });
      if (!success) return error(429, 'rate_limited', { 'Retry-After': '10' });
    }

    return handleArtifacts(request, env, config, token, state);
  };
}

const handle = createHandler();

export default {
  fetch(request: Request, env: Env) {
    return handle(request, env);
  },
};
