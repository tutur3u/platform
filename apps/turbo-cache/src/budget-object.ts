import {
  admit,
  type BudgetState,
  emptyState,
  isAdmissionRequest,
  reset,
  rollState,
  trip,
} from './budget';
import { type Env, readConfig } from './config';

export interface DurableObjectStorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

export interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
}

const STATE_KEY = 'budget';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

// One global instance serializes admission. Durable Object input gates hold
// other events while a storage read or write is pending, so each
// read-modify-write below is atomic without explicit locking.
export class TurboCacheBudget {
  constructor(
    private readonly state: DurableObjectStateLike,
    private readonly env: Env,
    private readonly clock: () => Date = () => new Date()
  ) {}

  private async load(now: Date) {
    const stored = await this.state.storage.get<BudgetState>(STATE_KEY);
    return stored ? rollState(stored, now) : emptyState(now);
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const now = this.clock();

    if (request.method === 'POST' && pathname === '/admit') {
      const body: unknown = await request.json().catch(() => null);
      if (!isAdmissionRequest(body)) return json({ error: 'invalid' }, 400);
      const current = await this.load(now);
      const result = admit(current, body, readConfig(this.env).budget, now);
      await this.state.storage.put(STATE_KEY, result.state);
      return json({ allowed: result.allowed, reason: result.reason });
    }

    if (request.method === 'POST' && pathname === '/fence') {
      const body = (await request.json().catch(() => null)) as {
        action?: unknown;
      } | null;
      const current = await this.load(now);
      if (body?.action === 'trip') {
        const next = trip(current, 'operator', now);
        await this.state.storage.put(STATE_KEY, next);
        return json(next);
      }
      if (body?.action === 'reset') {
        const next = reset(current, now);
        await this.state.storage.put(STATE_KEY, next);
        return json(next);
      }
      return json({ error: 'invalid' }, 400);
    }

    if (request.method === 'GET' && pathname === '/state') {
      return json(await this.load(now));
    }

    return json({ error: 'not_found' }, 404);
  }
}
