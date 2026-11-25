import {
  CI_LIMITS,
  type CiOperation,
  type CiPlanEntry,
  type CiRegistrationInput,
} from './ci-registry';
import { utcDay } from './core';
import type { RouterEnv } from './http';
import { error, json, NOT_FOUND, operator, STATUS } from './http-shared';
import { authorizeForCiRegistration, verifyGithubToken } from './oidc';
import * as v from './validate';

// Routes under /v1/ci/main. Registration takes a GitHub OIDC token from
// ci-register.yaml; every other route is an operator call.
//
//   GET  /v1/ci/main                         status, stop fence and budget
//   POST /v1/ci/main/stop | /resume          durable stop fence
//   POST /v1/ci/main/registrations           register a main push (OIDC)
//   GET  /v1/ci/main/registrations?limit=N   newest first, N <= 100
//   GET  /v1/ci/main/registrations/:sha      one registration

const WORKFLOW = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\.ya?ml$/;
const CLOSURE_KEY = /^[0-9a-f]{1,64}$/;

// The UTC day the budget ran out, remembered per isolate so further
// registrations are answered without reaching the object.
let exhaustedDay: string | null = null;

export function resetCiExhaustedForTests() {
  exhaustedDay = null;
}

export async function handleCi(request: Request, env: RouterEnv) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean).slice(2);
  const method = request.method;
  if (parts[0] !== 'main') return NOT_FOUND();
  const rest = parts.slice(1);
  try {
    if (rest[0] === 'registrations' && rest.length === 1 && method === 'POST')
      return await register(request, env);
    const actor = await operator(request, env.operatorToken);
    if (actor instanceof Response) return actor;
    if (rest.length === 0 && method === 'GET')
      return await call(env, { op: 'status' });
    if (rest.length === 1 && method === 'POST' && rest[0] === 'stop')
      return await call(env, {
        op: 'stop',
        actor,
        reason: v.reasonText((await v.readJson(request)).reason),
      });
    if (rest.length === 1 && method === 'POST' && rest[0] === 'resume')
      return await call(env, { op: 'resume' });
    if (rest[0] !== 'registrations' || method !== 'GET') return NOT_FOUND();
    if (rest.length === 1)
      return await call(env, {
        op: 'list',
        limit: listLimit(url.searchParams.get('limit')),
      });
    if (rest.length === 2 && /^[0-9a-f]{40}$/.test(rest[1] ?? ''))
      return await call(env, { op: 'get', sha: rest[1] as string });
    return NOT_FOUND();
  } catch (caught) {
    if (caught instanceof v.InvalidInput)
      return error(400, 'INVALID_INPUT', caught.message);
    throw caught;
  }
}

async function call(env: RouterEnv, operation: CiOperation) {
  const result = await env.ciCall(operation);
  if (result.ok) return json(result.value);
  if (result.code === 'BUDGET_EXHAUSTED') exhaustedDay = utcDay(env.now());
  return error(STATUS[result.code], result.code, result.message);
}

async function register(request: Request, env: RouterEnv) {
  // Both switches answer before the token is read or the object is reached.
  if (!env.enabled) return error(503, 'COORDINATOR_OFF');
  if (!env.ciEnabled) return error(503, 'CI_OFF');
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return error(401, 'UNAUTHORIZED');
  const verified = await verifyGithubToken(header.slice(7), {
    audience: env.audience,
    repositoryId: env.repositoryId,
    keys: env.keys,
    nowSeconds: Math.floor(env.now() / 1000),
  });
  if (!verified.ok) return error(401, 'UNAUTHORIZED', verified.reason);
  const { claims } = verified;
  const denied = authorizeForCiRegistration(claims);
  if (denied) return error(403, 'FORBIDDEN', denied);
  const body = await v.readJson(request, CI_LIMITS.maxBodyBytes);
  // The registered commit is always the token's own.
  if (body.sha !== claims.sha)
    return error(400, 'INVALID_INPUT', 'sha must match the token');
  const input: CiRegistrationInput = {
    sha: v.sha(claims.sha),
    before: body.before == null ? null : v.sha(body.before),
    base: body.base == null ? null : v.sha(body.base),
    plan: plan(body.plan),
    runId: Number(claims.run_id),
    runAttempt: Number(claims.run_attempt),
    actor: `github:${claims.actor}`,
    logsUrl: `https://github.com/${claims.repository}/actions/runs/${claims.run_id}/attempts/${claims.run_attempt}`,
  };
  if (exhaustedDay === utcDay(env.now())) return error(429, 'BUDGET_EXHAUSTED');
  return call(env, { op: 'register', input });
}

function listLimit(value: string | null) {
  if (value === null) return CI_LIMITS.defaultListLimit;
  const limit = /^\d{1,3}$/.test(value) ? Number(value) : 0;
  if (limit < 1 || limit > CI_LIMITS.maxListLimit)
    throw new v.InvalidInput('Invalid limit');
  return limit;
}

function reason(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > CI_LIMITS.reasonLength ||
    [...value].some((char) => {
      const code = char.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    })
  )
    throw new v.InvalidInput('Invalid plan reason');
  return value;
}

export function plan(value: unknown): CiPlanEntry[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > CI_LIMITS.maxPlanEntries
  )
    throw new v.InvalidInput('Invalid plan');
  const seen = new Set<string>();
  return value.map((raw) => {
    const entry = v.object(raw, 'plan entry');
    const workflow = entry.workflow;
    if (typeof workflow !== 'string' || !WORKFLOW.test(workflow))
      throw new v.InvalidInput('Invalid plan workflow');
    if (seen.has(workflow)) throw new v.InvalidInput('Duplicate plan workflow');
    seen.add(workflow);
    if (typeof entry.run !== 'boolean')
      throw new v.InvalidInput('Invalid plan run');
    const closureKey = entry.closureKey ?? null;
    if (
      closureKey !== null &&
      (typeof closureKey !== 'string' || !CLOSURE_KEY.test(closureKey))
    )
      throw new v.InvalidInput('Invalid plan closureKey');
    return {
      workflow,
      run: entry.run,
      reason: reason(entry.reason),
      closureKey: closureKey as string | null,
    };
  });
}
