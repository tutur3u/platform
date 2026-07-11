import { createClient } from '@tuturuuu/supabase/next/server';
import StatisticCard from '@tuturuuu/ui/custom/statistic-card';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getContactsWorkspacePermissions } from '@/lib/workspace';

export default async function UserGroupTagsStatistics({
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
        .from('workspace_user_group_tags')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const permissions = await getContactsWorkspacePermissions(wsId);
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('manage_users')) return null;

  return (
    <StatisticCard
      title={t('workspace-users-tabs.group_tags')}
      value={userGroups}
      href={`/${wsId}/users/group-tags`}
    />
  );
}
