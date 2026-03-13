import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';

export default async function TemporarilyArchivedUsersStatistics({
  wsId,
}: {
  wsId: string;
  redirect?: boolean;
}) {
  const t = await getTranslations();
  const today = new Date().toISOString();
  const enabled = true;
  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('manage_users')) return null;

  const sbAdmin = await createAdminClient();

  const { count: temporarilyArchivedUsers } = enabled
    ? await sbAdmin
        .from('workspace_users')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
        .eq('archived', true)
        .gt('archived_until', today)
    : { count: 0 };

  return (
    <StatisticCard
      title={t('workspace-users-tabs.temporarily_archived')}
      value={temporarilyArchivedUsers}
      href={`/${wsId}/users/database?status=archived_until`}
    />
  );
}
