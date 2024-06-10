import { verifyHasSecrets } from '@/lib/workspace-helper';
import useTranslation from 'next-translate/useTranslation';

export default async function HealthcareCategoryStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const { t } = useTranslation('ws-home');

  const forceEnable = false;
  const enabled =
    forceEnable || (await verifyHasSecrets(wsId, ['ENABLE_HEALTHCARE']));

  if (!enabled) return null;

  return (
    <div className="mt-4 mb-2 text-2xl font-semibold">
      {t('sidebar-tabs:healthcare')}
    </div>
  );
}
