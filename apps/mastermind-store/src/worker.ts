/**
 * Mastermind store Worker: authenticated RPC in front of one SQLite Durable
 * Object. Routes:
 *
 * - `POST /v1/ops` (service token): up to 8 atomic key-value ops.
 * - `POST /v1/fence` (operator token): set or clear the durable stop fence.
 * - `GET /v1/status` (operator token): fence, today's writes, row count.
 * - `/v1/bridge/*`: the fleet bridge push channel (see bridge-routes.ts).
 *
 * No alarms, queues or retries. A single `get` may be served from the
 * per-colo Cache API for a few seconds. Every request writes one optional
 * Analytics Engine data point. See apps/docs/build/devops/mastermind-store.mdx.
 */
import {
  type StoreErrorCode,
  type StoreRpcResponse,
  storeFenceSchema,
  storeRpcSchema,
} from '@tuturuuu/utils/mastermind-store/protocol';
import { bridgeBudget, type FleetBridge } from './bridge';
import { handleBridge } from './bridge-routes';
import { json, readCapped, tokenMatches } from './http';
import type { MastermindStore } from './objects';

export { FleetBridge } from './bridge';
export { tokenMatches } from './http';
export { MastermindStore } from './objects';

export interface StoreEnv {
  MASTERMIND_STORE: DurableObjectNamespace<MastermindStore>;
  MASTERMIND_BRIDGE: DurableObjectNamespace<FleetBridge>;
  /** Billable bridge operations per UTC day; see bridge-engine.ts. */
  MASTERMIND_BRIDGE_DAILY_OPS?: string;
  /** Comma-separated service tokens (rotation); each at least 32 characters. */
  MASTERMIND_STORE_TOKENS?: string;
  MASTERMIND_STORE_OPERATOR_TOKEN?: string;
  MASTERMIND_STORE_DAILY_WRITE_BUDGET?: string;
  MASTERMIND_STORE_METRICS?: AnalyticsEngineDataset;
}

const DEFAULT_DAILY_WRITES = 50_000;
const MAX_DAILY_WRITES = 1_000_000;
const STATUS: Record<StoreErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  stopped: 503,
  budget: 429,
  full: 507,
  unavailable: 503,
};

const fail = (error: StoreErrorCode) =>
  json({ ok: false, error } satisfies StoreRpcResponse, STATUS[error]);

export function dailyWriteBudget(raw: string | undefined) {
  if (!raw?.trim()) return DEFAULT_DAILY_WRITES;
  if (!/^\d{1,7}$/u.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return value > 0 && value <= MAX_DAILY_WRITES ? value : null;
}

const stub = (env: StoreEnv) =>
  env.MASTERMIND_STORE.get(env.MASTERMIND_STORE.idFromName('v1'));

const bridgeStub = (env: StoreEnv) =>
  env.MASTERMIND_BRIDGE.get(env.MASTERMIND_BRIDGE.idFromName('v1'));

const cacheKey = (key: string) =>
  new Request(
    `https://mastermind-store.cache/v1/get/${encodeURIComponent(key)}`
  );

async function handleOps(request: Request, env: StoreEnv) {
  const auth = await tokenMatches(
    request.headers.get('authorization'),
    env.MASTERMIND_STORE_TOKENS
  );
  if (auth === 'unconfigured')
    return { response: fail('unavailable'), kind: 'unconfigured' };
  if (auth === 'denied')
    return { response: fail('unauthorized'), kind: 'denied' };
  const budget = dailyWriteBudget(env.MASTERMIND_STORE_DAILY_WRITE_BUDGET);
  if (budget === null) return { response: fail('unavailable'), kind: 'config' };

  const body = await readCapped(request);
  if (body === null)
    return { response: fail('bad_request'), kind: 'too_large' };
  let parsed: ReturnType<typeof storeRpcSchema.safeParse>;
  try {
    parsed = storeRpcSchema.safeParse(JSON.parse(body));
  } catch {
    return { response: fail('bad_request'), kind: 'json' };
  }
  if (!parsed.success) return { response: fail('bad_request'), kind: 'schema' };
  const ops = parsed.data.ops;
  const kind = ops.map((op) => op.op).join('+');

  const single = ops.length === 1 ? ops[0] : undefined;
  const cacheMs = single?.op === 'get' ? (single.cacheMs ?? 0) : 0;
  const cache =
    typeof caches === 'undefined'
      ? null
      : (caches as unknown as { default: Cache }).default;
  if (single?.op === 'get' && cacheMs > 0 && cache) {
    const hit = await cache.match(cacheKey(single.k));
    if (hit) return { response: hit, kind: `${kind}:hit` };
  }

  const result = await stub(env).run(ops, budget);
  if (!result.ok)
    return { response: fail(result.error), kind: `${kind}:${result.error}` };
  const response = json({ ok: true, results: result.results });
  if (single?.op === 'get' && cacheMs > 0 && cache) {
    const copy = response.clone();
    const headers = new Headers(copy.headers);
    headers.set(
      'cache-control',
      `max-age=${Math.max(1, Math.floor(cacheMs / 1000))}`
    );
    await cache.put(cacheKey(single.k), new Response(copy.body, { headers }));
  }
  return { response, kind };
}

async function handleOperator(request: Request, env: StoreEnv, path: string) {
  const auth = await tokenMatches(
    request.headers.get('authorization'),
    env.MASTERMIND_STORE_OPERATOR_TOKEN
  );
  if (auth === 'unconfigured') return fail('unavailable');
  if (auth === 'denied') return fail('unauthorized');
  const budget = dailyWriteBudget(env.MASTERMIND_STORE_DAILY_WRITE_BUDGET) ?? 0;
  if (path === '/v1/status' && request.method === 'GET')
    return json({
      ok: true,
      status: await stub(env).status(budget),
      bridge: await bridgeStub(env).status(
        bridgeBudget(env.MASTERMIND_BRIDGE_DAILY_OPS) ?? 0
      ),
    });
  if (path === '/v1/fence' && request.method === 'POST') {
    const body = await readCapped(request);
    let parsed: ReturnType<typeof storeFenceSchema.safeParse> | undefined;
    try {
      parsed = storeFenceSchema.safeParse(JSON.parse(body ?? ''));
    } catch {
      parsed = undefined;
    }
    if (!parsed?.success) return fail('bad_request');
    // One fence for the whole Worker: the store and the bridge stop together.
    const [stopped, bridgeStopped] = await Promise.all([
      stub(env).setFence(parsed.data.stopped),
      bridgeStub(env).setFence(parsed.data.stopped),
    ]);
    return json({ ok: true, stopped: stopped && bridgeStopped });
  }
  return json({ ok: false, error: 'bad_request' }, 404);
}

export default {
  async fetch(request: Request, env: StoreEnv): Promise<Response> {
    const started = Date.now();
    const path = new URL(request.url).pathname;
    let kind = 'other';
    let response: Response;
    try {
      if (path === '/v1/ops' && request.method === 'POST') {
        ({ response, kind } = await handleOps(request, env));
      } else if (path.startsWith('/v1/bridge/')) {
        ({ response, kind } = await handleBridge(request, env, path));
      } else if (path === '/v1/fence' || path === '/v1/status') {
        kind = path.slice(4);
        response = await handleOperator(request, env, path);
      } else {
        response = json({ ok: false, error: 'bad_request' }, 404);
      }
    } catch {
      response = fail('unavailable');
      kind = `${kind}:exception`;
    }
    // Health metrics: route, op kinds, status, latency. No keys or values.
    env.MASTERMIND_STORE_METRICS?.writeDataPoint({
      blobs: [path, kind, String(response.status)],
      doubles: [Date.now() - started],
      indexes: ['v1'],
    });
    return response;
  },
} satisfies ExportedHandler<StoreEnv>;
