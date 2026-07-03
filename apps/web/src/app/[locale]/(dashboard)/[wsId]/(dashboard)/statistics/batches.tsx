import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getInventoryBatches } from '@tuturuuu/inventory-core/product-rpc';

export default async function BatchesStatistics({ wsId }: { wsId: string }) {
  const supabase = await createAdminClient();
  const t = await getTranslations();

  const enabled = true;

  const { count: batches, error } = enabled
    ? await getInventoryBatches({
        limit: 1,
        sbAdmin: supabase,
        wsId,
      })
        .then(({ count }) => ({ count, error: null }))
        .catch((error) => ({ count: 0, error }))
    : { count: 0, error: null };

  if (error) {
    serverLogger.error('Error fetching inventory batches count', error);
  }

  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('view_inventory')) return null;

  return (
    <StatisticCard
      title={t('workspace-inventory-tabs.batches')}
      value={batches ?? 0}
      href={`/${wsId}/inventory/batches`}
    />
  );
}
