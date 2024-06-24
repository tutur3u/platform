import { verifyHasSecrets } from '@/lib/workspace-helper';
import { useTranslations } from 'next-intl';

export default async function FinanceCategoryStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const t = useTranslations('ws-home');

  const forceEnable = true;
  const enabled =
    forceEnable || (await verifyHasSecrets(wsId, ['ENABLE_FINANCE']));

  if (!enabled) return null;

  return (
    <div className="my-2 text-2xl font-semibold">
      {t('sidebar-tabs:finance')}
    </div>
  );
}
