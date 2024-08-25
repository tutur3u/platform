import { getPermissions, verifyHasSecrets } from '@/lib/workspace-helper';
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

  const { permissions } = await getPermissions({
    wsId,
    requiredPermissions: [
      'ai_chat',
      'ai_lab',
      'manage_calendar',
      'manage_projects',
      'manage_documents',
      'manage_drive',
      'manage_users',
      'manage_inventory',
      'manage_finance',
    ],
  });

  if (!enabled || !permissions.includes('manage_finance')) return null;

  return (
    <div className="my-2 text-2xl font-semibold">
      {t('sidebar_tabs.finance')}
    </div>
  );
}
