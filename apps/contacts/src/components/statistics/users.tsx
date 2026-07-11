import { createAdminClient } from '@tuturuuu/supabase/next/server';
import StatisticCard from '@tuturuuu/ui/custom/statistic-card';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

export default async function UsersStatistics({
  wsId,
}: {
  wsId: string;
  redirect?: boolean;
}) {
  const t = await getTranslations();
  const enabled = true;
  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('manage_users')) return null;

  const sbAdmin = await createAdminClient();

  const { count: users } = enabled
    ? await sbAdmin
        .from('workspace_users')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  return (
    <StatisticCard
      title={t('sidebar_tabs.users')}
      value={users}
      href={`/${wsId}/users/database`}
    />
  );
}
