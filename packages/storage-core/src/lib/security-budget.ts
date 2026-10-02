import 'server-only';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export type SecurityBudgetDimension = readonly [
  key: string,
  amount: number,
  maximum: number,
  ttl: number,
];

/** Explicit migration-first activation; never turn this off as an outage fallback. */
export function isSecurityEgressEnforcementEnabled() {
  return process.env.SECURITY_EGRESS_ENFORCEMENT_ENABLED === 'true';
}

let adminClient: Promise<TypedSupabaseClient> | undefined;

/** Postgres is authoritative; no Redis requirement or process-local fallback. */
export async function reserveSecurityBudget(
  dimensions: readonly SecurityBudgetDimension[]
) {
  adminClient ??= createDynamicAdminClient().catch((error) => {
    adminClient = undefined;
    throw error;
  });
  const client = await adminClient;
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
    (data[0] !== 0 && data[0] !== 1) ||
    !Number.isSafeInteger(data[1])
  ) {
    throw new Error('Shared security budget unavailable');
  }
  return data as [number, number];
}
