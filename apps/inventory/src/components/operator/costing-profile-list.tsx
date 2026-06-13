'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from '@tuturuuu/icons';
import type { InventoryCostProfile } from '@tuturuuu/internal-api/inventory';
import { deleteInventoryCostProfile } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { currency } from './operator-format';

export function CostingProfileList({
  profiles,
  wsId,
}: {
  profiles: InventoryCostProfile[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.costing');
  const forms = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: (profileId: string) =>
      deleteInventoryCostProfile(wsId, profileId),
    onError: () => toast.error(forms('deleteError')),
    onSuccess: () => {
      toast.success(forms('deleteSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });

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
                  {currency(profile.targetRetailPrice, profile.currency, 2)}
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
                  <Button
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(profile.id)}
                    size="icon"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
