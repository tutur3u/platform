import { describe, expect, it } from 'vitest';
import {
  PLAN_AI_REFERENCE_POLICY_VERSION,
  quotePlanAiReservation,
} from './plan-ai-reference-policy';

const rate = {
  policyVersion: PLAN_AI_REFERENCE_POLICY_VERSION,
  modelId: 'model-a',
  referenceCredits: 101,
  multiplierBasisPoints: 15_000,
} as const;

describe('versioned plan AI reference policy', () => {
  it('quotes a transparent credit rate and a separate provider reservation', () => {
    expect(
      quotePlanAiReservation({
        tier: 'PRO',
        rate,
        modelId: 'model-a',
        maxProviderUsdMicros: 250_000,
      })
    ).toEqual({
      policyVersion: PLAN_AI_REFERENCE_POLICY_VERSION,
      credits: 152,
      providerUsdMicros: 250_000,
      monthlyProviderBudgetUsdMicros: 6_000_000,
    });
  });

  it('rejects an unmatched model or request above the provider ceiling', () => {
    expect(
      quotePlanAiReservation({
        tier: 'MAX',
        rate,
        modelId: 'model-b',
        maxProviderUsdMicros: 1_000,
      })
    ).toBeNull();
    expect(
      quotePlanAiReservation({
        tier: 'ULTRA',
        rate,
        modelId: 'model-a',
        maxProviderUsdMicros: 72_730_001,
      })
    ).toBeNull();
  });
});
