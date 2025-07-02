import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

export async function InventoryCategoryStatistics({ wsId }: { wsId: string }) {
  const t = await getTranslations();

  const enabled = true;

  const { permissions } = await getPermissions({
    wsId,
  });

  if (!enabled || !permissions.includes('manage_inventory')) return null;

  return (
    <div className="mt-4 mb-2 font-semibold text-2xl">
      {t('sidebar_tabs.inventory')}
    </div>
  );
}
