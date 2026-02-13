import {
  getPermissions,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

export async function FinanceCategoryStatistics({ wsId }: { wsId: string }) {
  const t = await getTranslations();

  const forceEnable = true;
  const enabled =
    forceEnable || (await verifyHasSecrets(wsId, ['ENABLE_FINANCE']));

  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('manage_finance')) return null;

  return (
    <div className="my-2 font-semibold text-2xl">
      {t('sidebar_tabs.finance')}
    </div>
  );
}
