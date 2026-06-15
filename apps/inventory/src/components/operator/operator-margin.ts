import type { InventoryCostProfile } from '@tuturuuu/internal-api/inventory';

export type ProfileMargin = {
  currency: string;
  marginPercentage: number;
  profitPerUnit: number;
  retail: number;
  scenarioName: string;
  unitCost: number;
};

/**
 * Picks the strongest (highest gross-margin) scenario from a costing profile and
 * returns its server-computed margin figures. This connects a product's cost
 * (from costing) to its retail price so operators see profitability inline —
 * the foundation of the inventory ↔ finance margin view.
 *
 * Returns null when the profile has no scenario with a usable cost.
 */
export function bestProfileMargin(
  profile: InventoryCostProfile
): ProfileMargin | null {
  const usable = profile.scenarios.filter(
    (scenario) =>
      scenario.metrics && Number.isFinite(scenario.metrics.totalCostPerUnit)
  );

  if (usable.length === 0) return null;

  const best = usable.reduce((leader, scenario) =>
    scenario.metrics.grossMarginPercentage >
    leader.metrics.grossMarginPercentage
      ? scenario
      : leader
  );

  return {
    currency: profile.currency,
    marginPercentage: best.metrics.grossMarginPercentage,
    profitPerUnit: best.metrics.grossProfitPerUnit,
    retail: profile.targetRetailPrice,
    scenarioName: best.name,
    unitCost: best.metrics.totalCostPerUnit,
  };
}

/**
 * Aggregate margin across several matching profiles — used for a product-level
 * readout. Returns the best margin found across all profiles, or null.
 */
export function bestMarginAcrossProfiles(
  profiles: InventoryCostProfile[]
): ProfileMargin | null {
  let leader: ProfileMargin | null = null;

  for (const profile of profiles) {
    const margin = bestProfileMargin(profile);
    if (!margin) continue;
    if (!leader || margin.marginPercentage > leader.marginPercentage) {
      leader = margin;
    }
  }

  return leader;
}
