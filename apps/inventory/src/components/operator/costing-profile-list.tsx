'use client';

import type {
  InventoryCostProfile,
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import { CostingProfileDialog } from './costing-profile-dialog';
import { currency } from './operator-format';
import { useWorkspaceCurrency } from './workspace-currency';

export function CostingProfileList({
  options,
  products,
  profiles,
  wsId,
}: {
  options?: InventoryProductFormOptionsResponse;
  products?: InventoryProductSummary[];
  profiles: InventoryCostProfile[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.costing');
  const forms = useTranslations('inventory.operator.forms');
  const wsCurrency = useWorkspaceCurrency();

  if (profiles.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2">{t('item')}</th>
            <th className="px-3 py-2">{t('retail')}</th>
            <th className="px-3 py-2">{t('scenarios')}</th>
            <th className="px-3 py-2">{t('margin')}</th>
            <th className="px-3 py-2">{t('breakEven')}</th>
            <th className="px-3 py-2">{forms('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => {
            const firstScenario = profile.scenarios[0];

            return (
              <tr className="border-border border-t" key={profile.id}>
                <td className="px-3 py-3">
                  <p className="font-medium">{profile.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {profile.categoryName ?? t('uncategorized')}
                  </p>
                </td>
                <td className="px-3 py-3">
                  {currency(
                    profile.targetRetailPrice,
                    profile.currency || wsCurrency
                  )}
                </td>
                <td className="px-3 py-3">{profile.scenarios.length}</td>
                <td className="px-3 py-3">
                  {firstScenario
                    ? `${firstScenario.metrics.grossMarginPercentage}%`
                    : '-'}
                </td>
                <td className="px-3 py-3">
                  {firstScenario?.metrics.breakEvenQuantity ?? '-'}
                </td>
                <td className="px-3 py-3">
                  <CostingProfileDialog
                    options={options}
                    products={products}
                    profile={profile}
                    wsId={wsId}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
