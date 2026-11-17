import 'server-only';

import { createHash } from 'node:crypto';
import { boundedCitationOperation } from './ai/timeout';
import { getCitationRuntimeDb } from './runtime-db';

type BudgetRequest = {
  scope: 'lookup' | 'format' | 'ground';
  actorHash: string;
  window: number;
  actorLimit: number;
  globalLimit: number;
};
export type CitationBudgetStore = {
  reserve: (request: BudgetRequest) => Promise<boolean>;
};
export type CitationBudgetDependencies = {
  store?: () => Promise<CitationBudgetStore | null>;
  now?: () => number;
};
type BudgetResult =
  | { kind: 'allowed' }
  | { kind: 'rejected'; status: 429 | 503; retryAfter: number };

async function getCitationBudgetStore(): Promise<CitationBudgetStore> {
  const db = await getCitationRuntimeDb();
  return {
    async reserve({ scope, actorHash, window, actorLimit, globalLimit }) {
      const { data, error } = await db.rpc('reserve_cite_budget', {
        p_scope: scope,
        p_actor_hash: actorHash,
        p_window: window,
        p_actor_limit: actorLimit,
        p_global_limit: globalLimit,
      });
      if (error || typeof data !== 'boolean')
        throw new Error('Citation budget unavailable');
      return data;
    },
  };
}

export async function reserveCitationBudget(
  budget: Pick<BudgetRequest, 'scope' | 'actorLimit' | 'globalLimit'> & {
    actor: string;
  },
  dependencies: CitationBudgetDependencies = {}
): Promise<BudgetResult> {
  const { actor, ...limits } = budget;
  const unavailable = {
    kind: 'rejected',
    status: 503,
    retryAfter: 60,
  } as const;
  if (!actor) return unavailable;
  const now = (dependencies.now ?? Date.now)();
  const window = Math.floor(now / 60_000);
  const retryAfter = Math.max(1, 60 - Math.floor((now % 60_000) / 1000));
  try {
    const store = await boundedCitationOperation(
      (dependencies.store ?? getCitationBudgetStore)(),
      5000
    );
    if (!store) return unavailable;
    const admitted = await boundedCitationOperation(
      store.reserve({
        ...limits,
        actorHash: createHash('sha256').update(actor).digest('hex'),
        window,
      }),
      5000
    );
    return admitted
      ? { kind: 'allowed' }
      : { kind: 'rejected', status: 429, retryAfter };
  } catch {
    return unavailable;
  }
}
