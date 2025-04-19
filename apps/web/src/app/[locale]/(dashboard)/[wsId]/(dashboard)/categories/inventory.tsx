import { getPermissions } from '@/lib/workspace-helper';
import { getTranslations } from 'next-intl/server';

export async function InventoryCategoryStatistics({ wsId }: { wsId: string }) {
  const t = await getTranslations();

  const enabled = true;

  const { permissions } = await getPermissions({
    wsId,
  });

  if (!enabled || !permissions.includes('manage_inventory')) return null;

  return (
    <div className="mb-2 mt-4 text-2xl font-semibold">
      {t('sidebar_tabs.inventory')}
    </div>
  );
}
