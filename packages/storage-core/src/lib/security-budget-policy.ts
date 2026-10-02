import 'server-only';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';

export type SecurityBudgetTier = 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE';
export interface SecurityBudgetPolicy {
  tier: SecurityBudgetTier;
  paidWorkspaceCount: number;
  multiplier: number;
}
export const MAX_SECURITY_BUDGET_MULTIPLIER = 40;
const MULTIPLIERS = { FREE: 1, PLUS: 4, PRO: 10, ENTERPRISE: 20 } as const;
export const FREE_SECURITY_BUDGET_POLICY: SecurityBudgetPolicy = {
  tier: 'FREE',
  paidWorkspaceCount: 0,
  multiplier: 1,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const cache = new Map<
  string,
  { expiresAt: number; value: Promise<SecurityBudgetPolicy> }
>();
let client: ReturnType<typeof createDynamicAdminClient> | undefined;

export function securityBudgetPolicyFromEntitlement(
  value: unknown
): SecurityBudgetPolicy {
  const policy = value as Partial<SecurityBudgetPolicy> | null;
  if (
    !policy?.tier ||
    !Object.hasOwn(MULTIPLIERS, policy.tier) ||
    !Number.isSafeInteger(policy.paidWorkspaceCount) ||
    policy.paidWorkspaceCount! < 0 ||
    (policy.tier === 'FREE') !== (policy.paidWorkspaceCount === 0)
  )
    throw new Error('Security entitlement unavailable');
  const bonus =
    1 + Math.min(4, Math.max(0, policy.paidWorkspaceCount! - 1)) * 0.25;
  return {
    tier: policy.tier,
    paidWorkspaceCount: policy.paidWorkspaceCount!,
    multiplier: MULTIPLIERS[policy.tier] * bonus,
  };
}

/** Cache entitlement reads briefly, never counter allowances or outage fallbacks. */
export async function getSecurityBudgetPolicy(scope: {
  workspaceId?: string;
  userId?: string;
}) {
  const workspaceId =
    scope.workspaceId && UUID.test(scope.workspaceId)
      ? scope.workspaceId
      : undefined;
  const userId =
    scope.userId && UUID.test(scope.userId) ? scope.userId : undefined;
  if (!workspaceId && !userId) return FREE_SECURITY_BUDGET_POLICY;
  const key = `${workspaceId ?? ''}:${userId ?? ''}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  cache.delete(key);
  if (cache.size >= 512) cache.delete(cache.keys().next().value!);
  const value = (async () => {
    client ??= createDynamicAdminClient().catch((error) => {
      client = undefined;
      throw error;
    });
    const { data, error } = await (await client)
      .rpc('get_security_budget_entitlement', {
        p_ws_id: workspaceId ?? null,
        p_user_id: userId ?? null,
      })
      .abortSignal(AbortSignal.timeout(3000));
    if (error) throw new Error('Security entitlement unavailable');
    return securityBudgetPolicyFromEntitlement(data);
  })();
  const entry = { expiresAt: Date.now() + 30_000, value };
  cache.set(key, entry);
  try {
    return await value;
  } catch (error) {
    if (cache.get(key) === entry) cache.delete(key);
    throw error;
  }
}

export function scaledSecurityBudgetLimit(
  base: number,
  policy: SecurityBudgetPolicy,
  ceiling = Number.MAX_SAFE_INTEGER
) {
  const value = Math.floor(base * policy.multiplier);
  if (!Number.isSafeInteger(base) || base < 1 || !Number.isSafeInteger(value))
    throw new Error('Invalid security limit');
  return Math.min(ceiling, value);
}
