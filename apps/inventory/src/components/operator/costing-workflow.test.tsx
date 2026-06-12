import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InventoryCostProfile } from '@tuturuuu/internal-api/inventory';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CostingPanel } from './costing-panel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api/inventory', async () => {
  const actual = await vi.importActual('@tuturuuu/internal-api/inventory');
  return {
    ...actual,
    createInventoryCostProfile: vi.fn(),
    deleteInventoryCostProfile: vi.fn(),
    importInventoryCostingCsv: vi.fn(),
  };
});

function renderPanel(profiles: InventoryCostProfile[]) {
  const client = new QueryClient();

  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <CostingPanel
        analytics={{
          averageMarginPercentage: profiles.length ? 60 : 0,
          lowestBreakEvenQuantity: profiles.length ? 4 : null,
          profilesCount: profiles.length,
          scenarios: profiles.flatMap((profile) =>
            profile.scenarios.map((scenario) => ({
              batchCost: scenario.metrics.batchCost,
              batchSize: scenario.batchSize,
              breakEvenQuantity: scenario.metrics.breakEvenQuantity,
              currency: profile.currency,
              grossMarginPercentage: scenario.metrics.grossMarginPercentage,
              grossProfitPerUnit: scenario.metrics.grossProfitPerUnit,
              profileId: profile.id,
              profileName: profile.name,
              scenarioId: scenario.id,
              scenarioName: scenario.name,
              targetRetailPrice: profile.targetRetailPrice,
              totalCostPerUnit: scenario.metrics.totalCostPerUnit,
            }))
          ),
          scenariosCount: profiles.reduce(
            (count, profile) => count + profile.scenarios.length,
            0
          ),
        }}
        profiles={profiles}
        wsId="ws-1"
      />
    </QueryClientProvider>
  );
}

describe('CostingPanel', () => {
  it('renders a single primary empty state for an empty costing workspace', () => {
    const html = renderPanel([]);

    expect(html.match(/emptyTitle/g)).toHaveLength(1);
    expect(html).toContain('summaryDescription');
  });

  it('renders populated profiles without the empty state', () => {
    const html = renderPanel([
      {
        categoryId: null,
        categoryName: null,
        createdAt: null,
        currency: 'USD',
        id: 'profile-1',
        name: 'Acrylic Keychain',
        notes: null,
        productId: null,
        profitShares: [],
        scenarios: [
          {
            artCommissionCost: 40,
            batchSize: 30,
            createdAt: null,
            id: 'scenario-1',
            manufacturingCostPerUnit: 0.7,
            metrics: {
              batchCost: 41,
              breakEvenQuantity: 4,
              grossMarginPercentage: 60.43,
              grossProfitPerUnit: 6.04,
              totalCostPerUnit: 1.37,
            },
            name: '30 units',
            otherCostPerUnit: 0.67,
            packagingCostPerUnit: 0,
            profileId: 'profile-1',
            shippingCost: 20,
            sortOrder: 0,
            tariffCost: 0,
            updatedAt: null,
            wsId: 'ws-1',
          },
        ],
        status: 'active',
        targetRetailPrice: 10,
        updatedAt: null,
        wsId: 'ws-1',
      },
    ]);

    expect(html).toContain('Acrylic Keychain');
    expect(html).toContain('marginChart');
    expect(html).not.toContain('emptyTitle');
  });
});
