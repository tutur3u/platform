import { verifyHasSecrets } from '@/lib/workspace-helper';
import { getTranslations } from 'next-intl/server';

export default async function HealthcareCategoryStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const t = await getTranslations();

  const forceEnable = false;
  const enabled =
    forceEnable || (await verifyHasSecrets(wsId, ['ENABLE_HEALTHCARE']));

  if (!enabled) return null;

  return (
    <div className="mb-2 mt-4 text-2xl font-semibold">
      {t('sidebar_tabs.healthcare')}
    </div>
  );
}
