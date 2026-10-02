import 'server-only';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';

export type SecurityBudgetDimension = readonly [
  key: string,
  amount: number,
  maximum: number,
  ttl: number,
];

/** Postgres is authoritative; no Redis requirement or process-local fallback. */
export async function reserveSecurityBudget(
  dimensions: readonly SecurityBudgetDimension[]
) {
  const client = await createDynamicAdminClient();
  const { data, error } = await client
    .rpc('reserve_security_budget', {
      p_dimensions: dimensions.map(([key, amount, maximum, ttl]) => ({
        key,
        amount,
        maximum,
        ttl,
      })),
    })
    .abortSignal(AbortSignal.timeout(3000));
  if (
    error ||
    !Array.isArray(data) ||
    data.length !== 2 ||
    ![0, 1].includes(data[0]) ||
    !Number.isSafeInteger(data[1])
  ) {
    throw new Error('Shared security budget unavailable');
  }
  return data as [number, number];
}
