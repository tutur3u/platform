import type {
  UpgradePlan,
  UpgradePlanCycle,
  WorkspaceUpgradeOptions,
} from '@tuturuuu/internal-api';

import { workspaceTierRank } from '@tuturuuu/utils/feature-tier-policy';

export const tierRank = (tier: string | null | undefined) =>
  Math.max(0, workspaceTierRank(tier));

/** "Tuturuuu Workspace Plus Monthly" reads as "Plus". */
export function simplePlanName(name: string) {
  return (
    name
      .replace(/^Tuturuuu\s+Workspace\s+/i, '')
      .replace(/^Tuturuuu\s+/i, '')
      .replace(/\s+(Monthly|Yearly|Annual)$/i, '')
      .trim() || name
  );
}

export function formatCents(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    currency: 'USD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    style: 'currency',
  }).format(cents / 100);
}

/** The amount a plan charges per billing unit, in cents. */
export function planUnitPrice(plan: UpgradePlan) {
  return plan.pricingModel === 'seat_based'
    ? (plan.pricePerSeat ?? 0)
    : plan.price;
}

/** One plan per tier for a billing cycle; Free applies to both cycles. */
export function plansForCycle(
  plans: WorkspaceUpgradeOptions['plans'],
  cycle: UpgradePlanCycle
) {
  const byTier = new Map<string, UpgradePlan>();
  for (const plan of plans) {
    if (plan.billingCycle !== null && plan.billingCycle !== cycle) continue;
    if (!byTier.has(plan.tier)) byTier.set(plan.tier, plan);
  }
  return [...byTier.values()].sort(
    (a, b) => tierRank(a.tier) - tierRank(b.tier)
  );
}

/** The pay billing page, optionally asking it to open the plan list. */
export function billingHandoffHref(billingUrl: string, planId?: string) {
  if (!planId) return billingUrl;
  const url = new URL(billingUrl);
  url.searchParams.set('plan', planId);
  return url.toString();
}

export function isForbidden(error: unknown) {
  return (error as { status?: number } | null)?.status === 403;
}
