import {
  getPermissions,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

export async function FinanceCategoryStatistics({ wsId }: { wsId: string }) {
  const t = await getTranslations();

  const forceEnable = true;
  const enabled =
    forceEnable || (await verifyHasSecrets(wsId, ['ENABLE_FINANCE']));

  const { permissions } = await getPermissions({
    wsId,
  });

  if (!enabled || !permissions.includes('manage_finance')) return null;

  return (
    <div className="my-2 text-2xl font-semibold">
      {t('sidebar_tabs.finance')}
    </div>
  );
}
