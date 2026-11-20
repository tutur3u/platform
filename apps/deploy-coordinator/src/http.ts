import { utcDay } from './core';
import type { CallContext, Operation } from './environment-service';
import {
  authorizeForEnvironment,
  type GithubClaims,
  type KeySource,
  verifyGithubToken,
} from './oidc';
import {
  type EnvironmentName,
  findProject,
  isEnvironment,
  objectName,
  PROJECTS,
  type ProjectEntry,
} from './projects';
import type { CoordinatorErrorCode, Deployment, Result } from './types';
import * as v from './validate';

export type RouterEnv = {
  enabled: boolean;
  audience: string;
  repositoryId: string;
  operatorToken: string | undefined;
  keys: KeySource;
  now: () => number;
  call: (
    name: string,
    context: CallContext,
    operation: Operation
  ) => Promise<Result<unknown>>;
};

const STATUS: Record<CoordinatorErrorCode, number> = {
  BUDGET_EXHAUSTED: 429,
  CAPACITY: 429,
  CONFLICT: 409,
  INVALID_STATE: 409,
  LEASE_EXPIRED: 409,
  NOT_FOUND: 404,
  RUN_MISMATCH: 403,
  STALE_GRANT: 409,
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const error = (status: number, code: string, message = code) =>
  json({ error: code, message }, status);
const NOT_FOUND = () => error(404, 'NOT_FOUND', 'Not found');

// Environments whose daily budget ran out, remembered per isolate until UTC
// midnight so further calls are answered without reaching the object.
const exhausted = new Map<string, string>();

type Target = {
  project: ProjectEntry;
  environment: EnvironmentName;
  name: string;
};

const CI_ACTIONS = new Set(['claim', 'heartbeat', 'complete', 'skip']);
const OPERATOR_ACTIONS = new Set(['cancel', 'resolve', 'promote', 'rollback']);

export async function handle(request: Request, env: RouterEnv) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const method = request.method;
  if (url.pathname === '/health')
    return method === 'GET' ? json({ ok: true }) : NOT_FOUND();
  if (parts[0] !== 'v1' || parts[1] !== 'projects') return NOT_FOUND();

  try {
    if (parts.length === 2 && method === 'GET') {
      const actor = await operator(request, env);
      if (actor instanceof Response) return actor;
      return json({ projects: PROJECTS });
    }
    const project = findProject(parts[2] ?? '');
    const environment = parts[4] ?? '';
    if (!project || parts[3] !== 'environments' || !isEnvironment(environment))
      return NOT_FOUND();
    const target: Target = {
      project,
      environment,
      name: objectName(project.id, environment),
    };
    const rest = parts.slice(5);

    if (rest.length === 0 && method === 'GET')
      return await operatorCall(request, env, target, () => ({
        op: 'snapshot',
      }));
    if (rest[0] !== 'deployments' && rest.length === 1 && method === 'POST') {
      if (rest[0] === 'stop')
        return await operatorCall(request, env, target, async (actor) => ({
          op: 'stop',
          actor,
          reason: v.reasonText((await v.readJson(request)).reason),
        }));
      if (rest[0] === 'resume')
        return await operatorCall(request, env, target, () => ({
          op: 'resume',
        }));
    }
    if (rest[0] === 'hold' && rest[1] === 'release' && method === 'POST')
      return await operatorCall(request, env, target, async () => {
        const body = await v.readJson(request);
        return {
          op: 'releaseHold',
          lane: environment === 'preview' ? v.lane(body.lane) : 'default',
        };
      });
    if (rest[0] !== 'deployments') return NOT_FOUND();
    if (rest.length === 1 && method === 'POST')
      return await createDeployment(request, env, target);
    const id = rest[1];
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return NOT_FOUND();
    if (rest.length === 2 && method === 'GET')
      return await operatorCall(request, env, target, () => ({
        op: 'get',
        id,
      }));
    const action = rest[2] ?? '';
    if (rest.length !== 3 || method !== 'POST') return NOT_FOUND();
    if (CI_ACTIONS.has(action))
      return await ciAction(request, env, target, id, action);
    if (OPERATOR_ACTIONS.has(action))
      return await operatorAction(request, env, target, id, action);
    return NOT_FOUND();
  } catch (caught) {
    if (caught instanceof v.InvalidInput)
      return error(400, 'INVALID_INPUT', caught.message);
    throw caught;
  }
}

async function invoke(
  env: RouterEnv,
  target: Target,
  operation: Operation,
  exempt: boolean
) {
  const today = utcDay(env.now());
  if (!exempt && exhausted.get(target.name) === today)
    return error(429, 'BUDGET_EXHAUSTED');
  const result = await env.call(
    target.name,
    { project: target.project.id, environment: target.environment },
    operation
  );
  if (result.ok) return json(result.value);
  if (result.code === 'BUDGET_EXHAUSTED') exhausted.set(target.name, today);
  return error(STATUS[result.code], result.code, result.message);
}

async function operator(request: Request, env: RouterEnv) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!env.operatorToken || !token) return NOT_FOUND();
  if (!(await v.secretEquals(token, env.operatorToken))) return NOT_FOUND();
  try {
    return v.actor(request.headers.get('x-deploy-actor'));
  } catch {
    return error(400, 'INVALID_INPUT', 'Missing X-Deploy-Actor');
  }
}

async function operatorCall(
  request: Request,
  env: RouterEnv,
  target: Target,
  build: (actor: string) => Operation | Promise<Operation>
) {
  const actor = await operator(request, env);
  if (actor instanceof Response) return actor;
  const operation = await build(actor);
  const exempt = ['snapshot', 'get', 'stop', 'resume'].includes(operation.op);
  return invoke(env, target, operation, exempt);
}

async function operatorAction(
  request: Request,
  env: RouterEnv,
  target: Target,
  id: string,
  action: string
) {
  const actor = await operator(request, env);
  if (actor instanceof Response) return actor;
  const body = await v.readJson(request);
  if (action === 'cancel')
    return invoke(env, target, { op: 'cancel', id, actor }, false);
  if (action === 'rollback')
    return invoke(env, target, { op: 'rollback', id, actor }, false);
  if (action === 'resolve')
    return invoke(
      env,
      target,
      {
        op: 'resolve',
        id,
        actor,
        outcome: v.outcome(body.outcome),
        url: body.url == null ? null : v.httpsUrl(body.url),
      },
      false
    );
  // promote: a succeeded staging deployment becomes a production promotion.
  if (target.environment !== 'staging')
    return error(409, 'INVALID_STATE', 'Only staging promotes to production');
  const source = await env.call(
    target.name,
    { project: target.project.id, environment: target.environment },
    { op: 'get', id }
  );
  if (!source.ok)
    return error(STATUS[source.code], source.code, source.message);
  return invoke(
    env,
    {
      project: target.project,
      environment: 'production',
      name: objectName(target.project.id, 'production'),
    },
    { op: 'promotion', source: source.value as Deployment, actor },
    false
  );
}

async function ci(request: Request, env: RouterEnv, target: Target) {
  if (!env.enabled) return error(503, 'COORDINATOR_OFF');
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return error(401, 'UNAUTHORIZED');
  const verified = await verifyGithubToken(header.slice(7), {
    audience: env.audience,
    repositoryId: env.repositoryId,
    keys: env.keys,
    nowSeconds: Math.floor(env.now() / 1000),
  });
  if (!verified.ok) return error(401, 'UNAUTHORIZED', verified.reason);
  const denied = authorizeForEnvironment(
    verified.claims,
    target.project,
    target.environment
  );
  if (denied) return error(403, 'FORBIDDEN', denied);
  return verified.claims;
}

async function createDeployment(
  request: Request,
  env: RouterEnv,
  target: Target
) {
  const claims = await ci(request, env, target);
  if (claims instanceof Response) return claims;
  const body = await v.readJson(request);
  const preview = target.environment === 'preview';
  // Staging and production deploy the token's own commit.
  const sha = preview ? v.sha(body.sha) : claims.sha;
  if (!preview && body.sha !== undefined && body.sha !== claims.sha)
    return error(400, 'INVALID_INPUT', 'sha must match the token');
  const lane = preview ? v.lane(body.lane) : 'default';
  const plan = v.plan(body.plan);
  const artifact = v.artifact(body.artifact);
  const runId = Number(claims.run_id);
  const idempotencyKey = `ci:${claims.run_id}:${claims.run_attempt}:${lane}`;
  return invoke(
    env,
    target,
    {
      op: 'create',
      input: {
        project: target.project.id,
        environment: target.environment,
        lane,
        kind: 'deploy',
        sha,
        ref: preview ? lane : claims.ref,
        plan,
        sourceDeploymentId: null,
        artifact,
        logsUrl: logsUrl(claims),
        actor: `github:${claims.actor}`,
        runId,
        idempotencyKey,
        bodyDigest: await v.digestOf({ sha, lane, plan, artifact }),
      },
    },
    false
  );
}

function logsUrl(claims: GithubClaims) {
  return `https://github.com/${claims.repository}/actions/runs/${claims.run_id}/attempts/${claims.run_attempt}`;
}

async function ciAction(
  request: Request,
  env: RouterEnv,
  target: Target,
  id: string,
  action: string
) {
  const claims = await ci(request, env, target);
  if (claims instanceof Response) return claims;
  const body = await v.readJson(request);
  const runId = Number(claims.run_id);
  let operation: Operation;
  if (action === 'claim')
    operation = { op: 'claim', id, workerId: v.workerId(body.workerId), runId };
  else if (action === 'heartbeat')
    operation = { op: 'heartbeat', id, grant: v.grant(body.grant), runId };
  else if (action === 'skip')
    operation = { op: 'skip', id, runId, reason: v.code(body.reason) };
  else {
    const outcome = v.outcome(body.outcome);
    operation = {
      op: 'complete',
      id,
      runId,
      input: {
        grant: v.grant(body.grant),
        outcome,
        url: body.url == null ? null : v.httpsUrl(body.url),
        artifact: v.artifact(body.artifact),
        failureReason:
          body.failureReason == null ? null : v.code(body.failureReason),
      },
    };
  }
  return invoke(env, target, operation, false);
}

export function resetExhaustedForTests() {
  exhausted.clear();
}
