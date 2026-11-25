// Per-invocation query budget. D1 allows 1,000 queries per Worker
// invocation. The invocation boundary creates one budget and passes it to
// every client it builds; `forPrincipal` requires it, so the cap holds
// across clients and no client gets a budget of its own. A budget is
// charged before execution, so an over-budget statement or batch never
// reaches the database, and only budgets made here are accepted.

import { DataError } from './errors';

export const D1_QUERY_LIMIT = 1000;

export interface QueryBudget {
  readonly limit: number;
  readonly used: number;
  /** Charges `count` queries or throws `budget_exceeded` without charging. */
  take(count: number): void;
}

const budgets = new WeakSet<object>();

/** A budget for one invocation; a limit above 1,000 is clamped to 1,000. */
export function createInvocationBudget(
  limit: number = D1_QUERY_LIMIT
): QueryBudget {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error('Invalid query budget.');
  }
  const cap = Math.min(limit, D1_QUERY_LIMIT);
  let used = 0;
  const budget: QueryBudget = Object.freeze({
    limit: cap,
    get used() {
      return used;
    },
    take(count: number) {
      if (!Number.isInteger(count) || count < 0) {
        throw new Error('Invalid query count.');
      }
      if (used + count > cap) throw new DataError('budget_exceeded');
      used += count;
    },
  });
  budgets.add(budget);
  return budget;
}

export function isInvocationBudget(value: unknown): value is QueryBudget {
  return typeof value === 'object' && value !== null && budgets.has(value);
}
