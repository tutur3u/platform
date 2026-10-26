import {
  admit,
  emptyState,
  isAdmissionRequest,
  isBudgetState,
  reset,
  rollState,
  trip,
} from './budget';
import { readBudget } from './budget-store';
import { type Env, readConfig } from './config';

export const BUDGET_STORAGE_KEY = 'budget-v2';

export interface BudgetTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

export interface BudgetStorage extends BudgetTransaction {
  transaction<T>(callback: (txn: BudgetTransaction) => Promise<T>): Promise<T>;
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function parseStored(value: unknown) {
  if (value === undefined) return null;
  if (!isBudgetState(value)) throw new Error('invalid_budget');
  return value;
}

export class TurboCacheBudget {
  constructor(
    private readonly state: { storage: BudgetStorage },
    private readonly env: Env,
    private readonly clock: () => Date = () => new Date()
  ) {}

  async fetch(request: Request): Promise<Response> {
    try {
      const { pathname } = new URL(request.url);
      const now = this.clock();

      if (request.method === 'POST' && pathname === '/admit') {
        const body: unknown = await request.json().catch(() => null);
        if (!isAdmissionRequest(body)) return json({ error: 'invalid' }, 400);
        return await this.state.storage.transaction(async (txn) => {
          const current = parseStored(await txn.get(BUDGET_STORAGE_KEY));
          if (!current)
            return json({ allowed: false, reason: 'budget_unavailable' }, 503);
          const result = admit(current, body, readConfig(this.env).budget, now);
          if (result.allowed) await txn.put(BUDGET_STORAGE_KEY, result.state);
          return json({ allowed: result.allowed, reason: result.reason });
        });
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
        // Migration is explicit, read-only, and outside the retriable transaction.
        // Retire/drain the previous deployment before importing its usage.
        const stored = await this.state.storage.get(BUDGET_STORAGE_KEY);
        const legacy =
          stored === undefined ? await readBudget(this.env.ARTIFACTS) : null;
        return await this.state.storage.transaction(async (txn) => {
          const persisted = parseStored(await txn.get(BUDGET_STORAGE_KEY));
          const current = rollState(
            persisted ?? legacy ?? emptyState(now),
            now
          );
          const tripped = body.action === 'trip';
          if (persisted && current.fence.tripped === tripped)
            return json(current);
          const next = tripped
            ? trip(current, 'operator', now)
            : reset(current, now);
          await txn.put(BUDGET_STORAGE_KEY, next);
          return json(next);
        });
      }

      if (request.method === 'GET' && pathname === '/state') {
        const stored = parseStored(
          await this.state.storage.get(BUDGET_STORAGE_KEY)
        );
        return stored
          ? json(rollState(stored, now))
          : json({ error: 'budget_unavailable' }, 503);
      }

      return json({ error: 'not_found' }, 404);
    } catch {
      // Never retry an ambiguous reservation or grant artifact access on failure.
      // Transactions and DO output gates preserve committed charges across restarts.
      return json({ allowed: false, reason: 'budget_unavailable' }, 503);
    }
  }
}
