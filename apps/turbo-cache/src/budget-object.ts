import {
  admit,
  emptyState,
  isAdmissionRequest,
  reset,
  rollState,
  trip,
} from './budget';
import { readBudget, writeBudget } from './budget-store';
import { type Env, readConfig } from './config';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

// R2 is the only budget authority. The queue serializes external R2 I/O,
// which does not benefit from Durable Object storage input gates.
export class TurboCacheBudget {
  private pending: Promise<void> = Promise.resolve();

  constructor(
    _state: unknown,
    private readonly env: Env,
    private readonly clock: () => Date = () => new Date()
  ) {}

  fetch(request: Request): Promise<Response> {
    const response = this.pending.then(() => this.handle(request));
    this.pending = response.then(
      () => {},
      () => {}
    );
    return response;
  }

  private async handle(request: Request): Promise<Response> {
    try {
      const { pathname } = new URL(request.url);
      const now = this.clock();

      if (request.method === 'POST' && pathname === '/admit') {
        const body: unknown = await request.json().catch(() => null);
        if (!isAdmissionRequest(body)) return json({ error: 'invalid' }, 400);
        const current = await readBudget(this.env.ARTIFACTS);
        if (!current)
          return json({ allowed: false, reason: 'budget_unavailable' }, 503);
        const result = admit(current, body, readConfig(this.env).budget, now);
        // Denials, including stale concurrent reservations, never write.
        if (result.allowed) await writeBudget(this.env.ARTIFACTS, result.state);
        return json({ allowed: result.allowed, reason: result.reason });
      }

      if (request.method === 'POST' && pathname === '/fence') {
        const body: unknown = await request.json().catch(() => null);
        if (
          !body ||
          typeof body !== 'object' ||
          !('action' in body) ||
          (body.action !== 'trip' && body.action !== 'reset')
        )
          return json({ error: 'invalid' }, 400);
        const stored = await readBudget(this.env.ARTIFACTS);
        const current = stored ? rollState(stored, now) : emptyState(now);
        const tripped = body.action === 'trip';
        if (stored && current.fence.tripped === tripped) return json(current);
        const next = tripped
          ? trip(current, 'operator', now)
          : reset(current, now);
        await writeBudget(this.env.ARTIFACTS, next);
        return json(next);
      }

      if (request.method === 'GET' && pathname === '/state') {
        const stored = await readBudget(this.env.ARTIFACTS);
        return stored
          ? json(rollState(stored, now))
          : json({ error: 'budget_unavailable' }, 503);
      }

      return json({ error: 'not_found' }, 404);
    } catch {
      // A failed/unknown reservation is never retried or allowed. If the PUT
      // committed, the next request observes it and retains the charge.
      return json({ allowed: false, reason: 'budget_unavailable' }, 503);
    }
  }
}
