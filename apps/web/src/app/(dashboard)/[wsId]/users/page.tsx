import StatisticCard from '@/components/cards/StatisticCard';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import useTranslation from 'next-translate/useTranslation';
import { cookies } from 'next/headers';

interface Props {
  params: {
    wsId: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function WorkspaceUsersPage({ params: { wsId } }: Props) {
  const { t } = useTranslation();

  const usersLabel = t('sidebar-tabs:users');

  const users = await getUsersCount(wsId);
  const groups = await getGroupsCount(wsId);

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2">
        <StatisticCard
          title={usersLabel}
          color="blue"
          value={users}
          href={`/${wsId}/users/list`}
        />

        <StatisticCard
          title={t('workspace-users-tabs:groups')}
          color="green"
          value={groups}
          href={`/${wsId}/users/groups`}
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
