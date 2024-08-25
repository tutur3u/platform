import { getPermissions, verifyHasSecrets } from '@/lib/workspace-helper';
import { getTranslations } from 'next-intl/server';

export default async function UsersCategoryStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const t = await getTranslations();

  const forceEnable = false;
  const enabled =
    forceEnable || (await verifyHasSecrets(wsId, ['ENABLE_USERS']));

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

  if (!enabled || !permissions.includes('manage_users')) return null;

  return (
    <div className="mb-2 mt-4 text-2xl font-semibold">
      {t('sidebar_tabs.users')}
    </div>
  );
}
