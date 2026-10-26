/**
 * Abuse-guard store Worker: authenticated RPC over SQLite Durable Objects.
 *
 * Every request is authenticated and bounded before any Durable Object call.
 * The durable stop fence and per-family daily budgets in `GuardControl` are checked before
 * subject work; a stopped or unreachable fence fails closed (503).
 */

import { WorkerEntrypoint } from 'cloudflare:workers';
import {
  constantTimeEqual,
  GUARD_SIGNATURE_HEADER,
  GUARD_TIMESTAMP_HEADER,
  isStrongGuardSecret,
  parseGuardSecrets,
  verifyGuardRequest,
} from '@tuturuuu/utils/abuse-guard/crypto';
import {
  ABUSE_GUARD_LIMITS,
  ABUSE_GUARD_PROTOCOL_VERSION,
  type GuardErrorCode,
  type GuardRpcResponse,
  type GuardStepResult,
  guardRpcSchema,
  isGuardDenial,
  type ParsedGuardRpc,
} from '@tuturuuu/utils/abuse-guard/protocol';
import {
  admit,
  controlStub,
  type FenceEnv,
} from './fence';
import type { GuardControl, GuardSubject } from './objects';

export { GuardControl, GuardSubject } from './objects';

export interface Env extends FenceEnv {
  GUARD_SUBJECT: DurableObjectNamespace<GuardSubject>;
  GUARD_CONTROL: DurableObjectNamespace<GuardControl>;
  /** Comma-separated HMAC secrets: current first, previous during rotation. */
  ABUSE_GUARD_SECRETS?: string;
  ABUSE_GUARD_OPERATOR_TOKEN?: string;
  ABUSE_GUARD_LOCATION_HINT?: string;
}

const LOCATION_HINTS = new Set([
  'wnam',
  'enam',
  'sam',
  'weur',
  'eeur',
  'apac',
  'oc',
  'afr',
  'me',
]);

type RpcOutcome =
  | { status: 200; body: GuardRpcResponse }
  | { status: 400 | 401 | 413 | 503; body: { error: GuardErrorCode } };

function json(outcome: RpcOutcome | { status: number; body: unknown }) {
  return new Response(JSON.stringify(outcome.body), {
    status: outcome.status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

function failure(
  status: 400 | 401 | 413 | 503,
  error: GuardErrorCode
): RpcOutcome {
  return { status, body: { error } };
}

function subjectStub(env: Env, rpc: ParsedGuardRpc, partition: string) {
  const hint = env.ABUSE_GUARD_LOCATION_HINT?.trim() || 'apac';
  const id = env.GUARD_SUBJECT.idFromName(`${rpc.family}:${partition}`);
  return LOCATION_HINTS.has(hint)
    ? env.GUARD_SUBJECT.get(id, {
        locationHint: hint as DurableObjectLocationHint,
      })
    : env.GUARD_SUBJECT.get(id);
}

/** Executes a validated RPC with at most `steps.length` subject calls. */
export async function executeRpc(
  env: Env,
  rpc: ParsedGuardRpc
): Promise<RpcOutcome> {
  const ops = rpc.steps.reduce((total, step) => total + step.cmds.length, 0);
  try {
    if ((await admit(env, rpc.family, ops)) === 'stopped') {
      return failure(503, 'guard_stopped');
    }
  } catch {
    return failure(503, 'guard_unavailable');
  }

  try {
    // Each step records its operation id with its results in the same
    // transaction as the mutation, so replays and concurrent duplicates
    // return the original results instead of charging again.
    const hashes = await Promise.all(rpc.steps.map((step) => stepHash(step)));
    const runStep = async (
      step: ParsedGuardRpc['steps'][number],
      index: number
    ) =>
      subjectStub(env, rpc, step.p).run(step.cmds, {
        key: `op:${rpc.id}:${index}`,
        hash: hashes[index]!,
      });
    const outcomes: (Awaited<ReturnType<typeof runStep>> | null)[] = [];
    if (rpc.sequential) {
      let denied = false;
      for (const step of rpc.steps) {
        if (denied) {
          outcomes.push(null);
          // Skipped steps never run, so they are not billed.
          continue;
        }
        const outcome = await runStep(step, outcomes.length);
        outcomes.push(outcome);
        if (!outcome.ok || outcome.results.some(isGuardDenial)) denied = true;
      }
    } else {
      outcomes.push(...(await Promise.all(rpc.steps.map(runStep))));
    }

    const steps: GuardStepResult[] = [];
    for (const outcome of outcomes) {
      if (outcome === null) {
        steps.push({ skipped: true });
        continue;
      }
      if (!outcome.ok) return failure(400, 'bad_request');
      steps.push({ results: outcome.results });
    }
    return {
      status: 200,
      body: { v: ABUSE_GUARD_PROTOCOL_VERSION, steps },
    };
  } catch (error) {
    console.error('[abuse-guard] subject call failed', error);
    return failure(503, 'guard_unavailable');
  }
}

const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** The raw body, `null` when too large, or `undefined` when not UTF-8. */
async function readBoundedBody(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return strictUtf8.decode(bytes);
  } catch {
    return undefined;
  }
}

/**
 * Null when the configuration is unusable: empty, any secret short, or the
 * operator token reused as a signing secret (one leak would grant both).
 */
function acceptedSecrets(env: Env) {
  const secrets = parseGuardSecrets(env.ABUSE_GUARD_SECRETS);
  const operator = env.ABUSE_GUARD_OPERATOR_TOKEN?.trim() ?? '';
  let reused = false;
  for (const secret of secrets) {
    if (constantTimeEqual(secret, operator)) reused = true;
  }
  return secrets.length > 0 && secrets.every(isStrongGuardSecret) && !reused
    ? secrets
    : null;
}

async function stepHash(step: ParsedGuardRpc['steps'][number]) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(step))
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function handleRpc(request: Request, env: Env): Promise<RpcOutcome> {
  const secrets = acceptedSecrets(env);
  // A Worker without a usable secret set serves nothing.
  if (!secrets) return failure(503, 'guard_unavailable');

  const body = await readBoundedBody(request, ABUSE_GUARD_LIMITS.maxBodyBytes);
  if (body === null) return failure(413, 'bad_request');
  if (body === undefined) return failure(400, 'bad_request');

  const authorized = await verifyGuardRequest({
    secrets,
    method: request.method,
    path: new URL(request.url).pathname,
    body,
    timestamp: request.headers.get(GUARD_TIMESTAMP_HEADER),
    signature: request.headers.get(GUARD_SIGNATURE_HEADER),
    now: Date.now(),
  });
  if (!authorized) return failure(401, 'unauthorized');

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return failure(400, 'bad_request');
  }
  const parsed = guardRpcSchema.safeParse(payload);
  if (!parsed.success) return failure(400, 'bad_request');
  return executeRpc(env, parsed.data);
}

function operatorAuthorized(request: Request, env: Env) {
  const token = env.ABUSE_GUARD_OPERATOR_TOKEN?.trim() ?? '';
  const supplied =
    request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/iu)?.[1] ??
    '';
  return isStrongGuardSecret(token) && constantTimeEqual(token, supplied);
}

async function handleControl(request: Request, env: Env, pathname: string) {
  if (!operatorAuthorized(request, env)) {
    return json({ status: 401, body: { error: 'unauthorized' } });
  }
  const stub = controlStub(env);
  try {
    if (request.method === 'GET' && pathname === '/control/state') {
      return json({ status: 200, body: await stub.read() });
    }
    if (request.method === 'POST' && pathname === '/control/stop') {
      const state = await stub.setStopped(true);
      return json({ status: 200, body: state });
    }
    if (request.method === 'POST' && pathname === '/control/resume') {
      const state = await stub.setStopped(false);
      return json({ status: 200, body: state });
    }
  } catch (error) {
    console.error('[abuse-guard] control call failed', error);
    return json({ status: 503, body: { error: 'guard_unavailable' } });
  }
  return json({ status: 404, body: { error: 'not_found' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/v1/rpc') {
      if (request.method !== 'POST') {
        return json({ status: 405, body: { error: 'bad_request' } });
      }
      return json(await handleRpc(request, env));
    }
    if (pathname.startsWith('/control/')) {
      return handleControl(request, env, pathname);
    }
    return json({ status: 404, body: { error: 'not_found' } });
  },
} satisfies ExportedHandler<Env>;

/**
 * Service-binding entrypoint for native Workers. The binding is the trust
 * boundary, so no signature is required; validation and the fence still are.
 */
export class AbuseGuardEntrypoint extends WorkerEntrypoint<Env> {
  async run(
    rpc: unknown
  ): Promise<GuardRpcResponse | { error: GuardErrorCode }> {
    let size: number;
    try {
      // Circular or BigInt input cannot be serialized: reject, never throw.
      size = new TextEncoder().encode(JSON.stringify(rpc ?? null)).byteLength;
    } catch {
      return { error: 'bad_request' };
    }
    if (size > ABUSE_GUARD_LIMITS.maxBodyBytes) return { error: 'bad_request' };
    const parsed = guardRpcSchema.safeParse(rpc);
    if (!parsed.success) return { error: 'bad_request' };
    return (await executeRpc(this.env, parsed.data)).body;
  }
}
