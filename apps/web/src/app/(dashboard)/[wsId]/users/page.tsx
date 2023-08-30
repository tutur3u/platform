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
  const supabase = createServerComponentClient({ cookies });
  const { t } = useTranslation();

  const usersLabel = t('sidebar-tabs:users');

  const { count: users } = await supabase
    .from('workspace_users')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  const { count: groups } = await supabase
    .from('workspace_user_groups')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
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
