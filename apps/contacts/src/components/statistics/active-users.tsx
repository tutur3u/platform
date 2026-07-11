import { createAdminClient } from '@tuturuuu/supabase/next/server';
import StatisticCard from '@tuturuuu/ui/custom/statistic-card';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getContactsWorkspacePermissions } from '@/lib/workspace';

export default async function ActiveUsersStatistics({
  wsId,
}: {
  wsId: string;
  redirect?: boolean;
}) {
  const t = await getTranslations();
  const enabled = true;
  const permissions = await getContactsWorkspacePermissions(wsId);
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('manage_users')) return null;

  const sbAdmin = await createAdminClient();

  const { count: activeUsers } = enabled
    ? await sbAdmin
        .from('workspace_users')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
        .eq('archived', false)
    : { count: 0 };

  return (
    <StatisticCard
      title={t('workspace-users-tabs.active')}
      value={activeUsers}
      href={`/${wsId}/users/database`}
    />
  );
}
