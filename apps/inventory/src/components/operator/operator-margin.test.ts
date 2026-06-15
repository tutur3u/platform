import type {
  InventoryCostProfile,
  InventoryCostScenario,
} from '@tuturuuu/internal-api/inventory';
import { describe, expect, it } from 'vitest';
import { bestMarginAcrossProfiles, bestProfileMargin } from './operator-margin';

function scenario(
  name: string,
  metrics: Partial<InventoryCostScenario['metrics']>
): InventoryCostScenario {
  return {
    artCommissionCost: 0,
    batchSize: 30,
    createdAt: null,
    id: name,
    manufacturingCostPerUnit: 0,
    metrics: {
      batchCost: 0,
      breakEvenQuantity: null,
      grossMarginPercentage: 0,
      grossProfitPerUnit: 0,
      totalCostPerUnit: 0,
      ...metrics,
    },
    name,
    otherCostPerUnit: 0,
    packagingCostPerUnit: 0,
    profileId: 'p1',
    shippingCost: 0,
    sortOrder: 0,
    tariffCost: 0,
    updatedAt: null,
    wsId: 'ws1',
  };
}

function profile(
  scenarios: InventoryCostScenario[],
  targetRetailPrice = 100
): InventoryCostProfile {
  return {
    categoryId: null,
    categoryName: null,
    createdAt: null,
    currency: 'USD',
    id: 'p1',
    name: 'Profile',
    notes: null,
    productId: null,
    productName: null,
    profitShares: [],
    scenarios,
    status: 'active',
    targetRetailPrice,
    updatedAt: null,
    wsId: 'ws1',
  };
}

describe('bestProfileMargin', () => {
  it('returns null when no scenario has a usable cost', () => {
    expect(bestProfileMargin(profile([]))).toBeNull();
  });

  it('picks the scenario with the highest gross margin', () => {
    const result = bestProfileMargin(
      profile([
        scenario('small', {
          grossMarginPercentage: 40,
          grossProfitPerUnit: 40,
          totalCostPerUnit: 60,
        }),
        scenario('bulk', {
          grossMarginPercentage: 70,
          grossProfitPerUnit: 70,
          totalCostPerUnit: 30,
        }),
      ])
    );

    expect(result).toMatchObject({
      marginPercentage: 70,
      profitPerUnit: 70,
      retail: 100,
      scenarioName: 'bulk',
      unitCost: 30,
    });
  });
});

describe('bestMarginAcrossProfiles', () => {
  it('returns the strongest margin across all profiles', () => {
    const weak = profile(
      [scenario('a', { grossMarginPercentage: 25, totalCostPerUnit: 75 })],
      100
    );
    const strong = profile(
      [scenario('b', { grossMarginPercentage: 55, totalCostPerUnit: 45 })],
      100
    );

    expect(bestMarginAcrossProfiles([weak, strong])?.marginPercentage).toBe(55);
  });

  it('returns null when nothing is usable', () => {
    expect(bestMarginAcrossProfiles([profile([])])).toBeNull();
  });
});
