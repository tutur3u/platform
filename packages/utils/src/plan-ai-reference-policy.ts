import type { VersionedPlanTier } from './plan-quota-policy';

export const PLAN_AI_REFERENCE_POLICY_VERSION = '2026-11-26-reference-v1';

const PROVIDER_BUDGET_MICROS = {
  FREE: 1_000_000,
  PLUS: 4_000_000,
  PRO: 6_000_000,
  MAX: 37_500_000,
  ULTRA: 72_730_000,
} satisfies Record<VersionedPlanTier, number>;

interface ApprovedModelRate {
  policyVersion: typeof PLAN_AI_REFERENCE_POLICY_VERSION;
  modelId: string;
  referenceCredits: number;
  multiplierBasisPoints: number;
}

export function quotePlanAiReservation({
  tier,
  rate,
  modelId,
  maxProviderUsdMicros,
}: {
  tier: VersionedPlanTier;
  rate: ApprovedModelRate;
  modelId: string;
  maxProviderUsdMicros: number;
}) {
  const scaledCredits = rate.referenceCredits * rate.multiplierBasisPoints;
  if (
    rate.policyVersion !== PLAN_AI_REFERENCE_POLICY_VERSION ||
    !modelId ||
    rate.modelId !== modelId ||
    !Number.isSafeInteger(rate.referenceCredits) ||
    rate.referenceCredits <= 0 ||
    !Number.isSafeInteger(rate.multiplierBasisPoints) ||
    rate.multiplierBasisPoints <= 0 ||
    !Number.isSafeInteger(scaledCredits) ||
    !Number.isSafeInteger(maxProviderUsdMicros) ||
    maxProviderUsdMicros <= 0
  ) {
    return null;
  }

  const monthlyProviderBudgetUsdMicros = PROVIDER_BUDGET_MICROS[tier];
  if (maxProviderUsdMicros > monthlyProviderBudgetUsdMicros) return null;

  return {
    policyVersion: rate.policyVersion,
    credits: Math.ceil(scaledCredits / 10_000),
    providerUsdMicros: maxProviderUsdMicros,
    monthlyProviderBudgetUsdMicros,
  };
}
