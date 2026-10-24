import {
  BUDGET_SNAPSHOT_BYTES,
  type BudgetState,
  isBudgetState,
} from './budget';
import type { R2BucketLike } from './config';

// Outside v1/: artifact tokens cannot overwrite this key, and the artifact
// lifecycle rule must never expire the authoritative budget.
export const BUDGET_KEY = '_control/budget-v1';

export async function readBudget(bucket: R2BucketLike) {
  const object = await bucket.get(BUDGET_KEY);
  if (!object) return null;
  if (object.size > BUDGET_SNAPSHOT_BYTES) {
    await object.body.cancel();
    throw new Error('invalid_budget');
  }
  const value: unknown = await new Response(object.body).json();
  if (!isBudgetState(value)) throw new Error('invalid_budget');
  return value;
}

export async function writeBudget(bucket: R2BucketLike, state: BudgetState) {
  const value = JSON.stringify(state);
  if (new TextEncoder().encode(value).byteLength > BUDGET_SNAPSHOT_BYTES)
    throw new Error('invalid_budget');
  if (!(await bucket.put(BUDGET_KEY, value)))
    throw new Error('budget_write_failed');
}
