import { projectDelivery, validRepo, validSha } from './events';
import { authorized, boundedBody, verifyWebhook } from './security';
import { applyOperation, type DurableStore, type Operation } from './store';

interface FleetStatusEnv {
  FLEET_STATUS_ENABLED?: string;
  FLEET_STATUS_REPOS?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  FLEET_STATUS_READ_TOKEN?: string;
  FLEET_STATUS_OPERATOR_TOKEN?: string;
  FLEET_STATUS_GITHUB_TOKEN?: string;
  FLEET_STATUS_STATE: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
}

interface FleetStatusContext {
  storage: DurableStore;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

const response = (status: number) => new Response(null, { status });

function repos(value = '') {
  const names = value.split(',').map((name) => name.trim().toLowerCase());
  return names.length <= 8 && names.every(validRepo)
    ? new Set(names)
    : new Set<string>();
}

async function forward(env: FleetStatusEnv, operation: Operation) {
  const state = env.FLEET_STATUS_STATE;
  const result = await state.get(state.idFromName('fleet-status-v1')).fetch(
    new Request('https://fleet-status.internal/', {
      method: 'POST',
      body: JSON.stringify(operation),
    })
  );
  const headers = new Headers(result.headers);
  headers.set('Cache-Control', 'private, no-store');
  return new Response(result.body, { status: result.status, headers });
}

export default {
  async fetch(request: Request, env: FleetStatusEnv) {
    const path = new URL(request.url).pathname;
    if (path === '/v1/control/stop' && request.method === 'POST') {
      return (await authorized(request, env.FLEET_STATUS_OPERATOR_TOKEN))
        ? forward(env, { kind: 'stop' })
        : response(403);
    }
    if (env.FLEET_STATUS_ENABLED !== 'true') return response(503);
    if (path === '/v1/control/start' && request.method === 'POST') {
      return (await authorized(request, env.FLEET_STATUS_OPERATOR_TOKEN))
        ? forward(env, { kind: 'start' })
        : response(403);
    }
    const allowed = repos(env.FLEET_STATUS_REPOS);
    if (path === '/v1/github/webhook' && request.method === 'POST') {
      const signature = request.headers.get('X-Hub-Signature-256') ?? '';
      const secret = env.GITHUB_WEBHOOK_SECRET;
      const delivery = request.headers.get('X-GitHub-Delivery') ?? '';
      if (
        !secret ||
        !/^sha256=[a-f0-9]{64}$/.test(signature) ||
        !/^[a-f0-9-]{36}$/i.test(delivery)
      )
        return response(403);
      const bytes = await boundedBody(request.body);
      if (!bytes) return response(413);
      if (!(await verifyWebhook(secret, signature, bytes)))
        return response(403);
      let payload: unknown;
      try {
        payload = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return response(400);
      }
      const projected = projectDelivery(
        request.headers.get('X-GitHub-Event') ?? '',
        payload
      );
      if (!projected) return response(204);
      if (!allowed.has(projected.repo)) return response(403);
      return forward(env, {
        kind: 'ingest',
        repo: projected.repo,
        delivery,
        event: projected.projection,
      });
    }
    const match =
      /^\/v1\/repos\/([^/]+\/[^/]+)\/(?:commits\/([a-f0-9]{40})\/status|pulls\/([1-9][0-9]{0,10}))$/.exec(
        path
      );
    if (request.method !== 'GET' || !match) return response(404);
    if (!(await authorized(request, env.FLEET_STATUS_READ_TOKEN)))
      return response(403);
    const [, repo, sha, pull] = match;
    if (!repo || !allowed.has(repo)) return response(404);
    if (sha && validSha(sha))
      return forward(env, { kind: 'status', repo, sha });
    if (pull) return forward(env, { kind: 'pull', repo, number: Number(pull) });
    return response(404);
  },
};

export class FleetStatusState {
  constructor(
    private readonly ctx: FleetStatusContext,
    private readonly env: FleetStatusEnv
  ) {}

  async fetch(request: Request) {
    const operation = (await request.json()) as Operation;
    // Serialize admission, I/O and commit with the durable stop operation.
    return this.ctx.blockConcurrencyWhile(() =>
      applyOperation(this.ctx.storage, operation, {
        now: Date.now,
        upstream: fetch,
        githubToken: this.env.FLEET_STATUS_GITHUB_TOKEN,
      })
    );
  }
}
