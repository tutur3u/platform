import StatisticCard from '@/components/cards/StatisticCard';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import useTranslation from 'next-translate/useTranslation';
import { cookies } from 'next/headers';
import { getReportsCount } from '../reports/core';
import { verifyHasSecrets } from '@/lib/workspace-helper';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function WorkspaceUsersPage({ params: { wsId } }: Props) {
  await verifyHasSecrets(wsId, ['ENABLE_USERS'], `/${wsId}`);

  const { t } = useTranslation();
  const usersLabel = t('sidebar-tabs:users');

  const users = await getUsersCount(wsId);
  const groups = await getGroupsCount(wsId);
  const reports = await getReportsCount(wsId);

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="grid items-end gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatisticCard
          title={usersLabel}
          value={users}
          href={`/${wsId}/users/database`}
        />
        <StatisticCard
          title={t('workspace-users-tabs:groups')}
          value={groups}
          href={`/${wsId}/users/groups`}
        />
        <StatisticCard
          title={t('workspace-users-tabs:reports')}
          value={reports}
          href={`/${wsId}/users/reports`}
        />
      </div>
    </div>
  );
}

async function getUsersCount(wsId: string) {
  const supabase = createServerComponentClient({ cookies });

  const { count } = await supabase
    .from('workspace_users')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  return count;
}

async function getGroupsCount(wsId: string) {
  const supabase = createServerComponentClient({ cookies });

  const { count } = await supabase
    .from('workspace_user_groups')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  return count;
}
