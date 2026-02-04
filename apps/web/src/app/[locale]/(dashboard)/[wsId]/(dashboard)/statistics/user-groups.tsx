import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';

export default async function UserGroupsStatistics({
  wsId,
}: {
  wsId: string;
  redirect?: boolean;
}) {
  const supabase = await createClient();
  const t = await getTranslations();

  const enabled = true;

  const { count: userGroups } = enabled
    ? await supabase
        .from('workspace_user_groups')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const { containsPermission } = await getPermissions({
    wsId,
  });

  if (!enabled || !containsPermission('manage_users')) return null;

  return (
    <StatisticCard
      title={t('workspace-users-tabs.groups')}
      value={userGroups}
      href={`/${wsId}/users/groups`}
    />
  );
}
