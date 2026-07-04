import type { InventoryCostProfile } from '@tuturuuu/internal-api/inventory';

export type ScenarioInput = {
  id?: string;
  artCommissionCost: string;
  batchSize: string;
  manufacturingCostPerUnit: string;
  name: string;
  otherCostPerUnit: string;
  packagingCostPerUnit: string;
  shippingCost: string;
  tariffCost: string;
};

export type ProfitShareInput = {
  id?: string;
  recipientLabel: string;
  sharePercentage: string;
};

export type FormState = {
  categoryId: string;
  currency: string;
  name: string;
  notes: string;
  productId: string;
  profitShares: ProfitShareInput[];
  scenarios: ScenarioInput[];
  status: InventoryCostProfile['status'];
  targetRetailPrice: string;
};

export function numeric(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function emptyScenario(): ScenarioInput {
  return {
    artCommissionCost: '',
    batchSize: '30',
    manufacturingCostPerUnit: '',
    name: '',
    otherCostPerUnit: '',
    packagingCostPerUnit: '',
    shippingCost: '',
    tariffCost: '',
  };
}

export function defaultProfitShares(): ProfitShareInput[] {
  return [
    { recipientLabel: 'Talent', sharePercentage: '70' },
    { recipientLabel: 'Partner', sharePercentage: '30' },
  ];
}

export function initialState(
  profile: InventoryCostProfile | undefined,
  fallbackCurrency: string
): FormState {
  if (!profile) {
    return {
      categoryId: '',
      currency: fallbackCurrency,
      name: '',
      notes: '',
      productId: '',
      profitShares: defaultProfitShares(),
      scenarios: [emptyScenario()],
      status: 'active',
      targetRetailPrice: '',
    };
  }

  return {
    categoryId: profile.categoryId ?? '',
    currency: profile.currency,
    name: profile.name,
    notes: profile.notes ?? '',
    productId: profile.productId ?? '',
    profitShares: profile.profitShares.length
      ? profile.profitShares.map((share) => ({
          id: share.id,
          recipientLabel: share.recipientLabel,
          sharePercentage: String(share.sharePercentage),
        }))
      : defaultProfitShares(),
    scenarios: profile.scenarios.length
      ? profile.scenarios.map((scenario) => ({
          artCommissionCost: String(scenario.artCommissionCost ?? ''),
          batchSize: String(scenario.batchSize ?? ''),
          id: scenario.id,
          manufacturingCostPerUnit: String(
            scenario.manufacturingCostPerUnit ?? ''
          ),
          name: scenario.name,
          otherCostPerUnit: String(scenario.otherCostPerUnit ?? ''),
          packagingCostPerUnit: String(scenario.packagingCostPerUnit ?? ''),
          shippingCost: String(scenario.shippingCost ?? ''),
          tariffCost: String(scenario.tariffCost ?? ''),
        }))
      : [emptyScenario()],
    status: profile.status,
    targetRetailPrice: String(profile.targetRetailPrice ?? ''),
  };
}

// Maps the string-based form state into the numeric payload the API expects.
// The backend replaces the scenarios/profitShares arrays wholesale.
export function buildProfilePayload(form: FormState) {
  return {
    categoryId: form.categoryId || null,
    currency: form.currency.trim().toUpperCase() || 'USD',
    name: form.name.trim(),
    notes: form.notes || null,
    productId: form.productId || null,
    profitShares: form.profitShares.map((share, index) => ({
      ...(share.id ? { id: share.id } : {}),
      recipientLabel: share.recipientLabel.trim() || `Recipient ${index + 1}`,
      sharePercentage: numeric(share.sharePercentage),
      sortOrder: index,
    })),
    scenarios: form.scenarios.map((scenario, index) => ({
      ...(scenario.id ? { id: scenario.id } : {}),
      artCommissionCost: numeric(scenario.artCommissionCost),
      batchSize: Math.max(1, numeric(scenario.batchSize)),
      manufacturingCostPerUnit: numeric(scenario.manufacturingCostPerUnit),
      name: scenario.name.trim() || `${scenario.batchSize || index + 1} units`,
      otherCostPerUnit: numeric(scenario.otherCostPerUnit),
      packagingCostPerUnit: numeric(scenario.packagingCostPerUnit),
      shippingCost: numeric(scenario.shippingCost),
      sortOrder: index,
      tariffCost: numeric(scenario.tariffCost),
    })),
    status: form.status,
    targetRetailPrice: numeric(form.targetRetailPrice),
  };
}
