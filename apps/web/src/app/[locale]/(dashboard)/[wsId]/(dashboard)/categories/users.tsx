import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

export async function UsersCategoryStatistics({ wsId }: { wsId: string }) {
  const t = await getTranslations();
  const enabled = true;

  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('manage_users')) return null;

  return (
    <div className="mt-4 mb-2 font-semibold text-2xl">
      {t('sidebar_tabs.users')}
    </div>
  );
}
