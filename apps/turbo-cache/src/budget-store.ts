import { BUDGET_SNAPSHOT_BYTES, isBudgetState } from './budget';
import type { R2BucketLike } from './config';

// Read only during explicit migration into DO storage; never used for admission.
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
