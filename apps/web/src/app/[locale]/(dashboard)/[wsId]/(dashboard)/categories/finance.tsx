import { verifyHasSecrets } from '@/lib/workspace-helper';
import { getTranslations } from 'next-intl/server';

export default async function FinanceCategoryStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const t = await getTranslations();

  const forceEnable = true;
  const enabled =
    forceEnable || (await verifyHasSecrets(wsId, ['ENABLE_FINANCE']));

  if (!enabled) return null;

  return (
    <div className="my-2 text-2xl font-semibold">
      {t('sidebar_tabs.finance')}
    </div>
  );
}
