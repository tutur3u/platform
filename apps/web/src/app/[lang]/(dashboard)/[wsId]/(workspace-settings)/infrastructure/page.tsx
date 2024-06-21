import StatisticCard from '../../../../../../components/cards/StatisticCard';
import tzs from '@/data/timezones.json';
import { enforceRootWorkspaceAdmin } from '@/lib/workspace-helper';
import { createAdminClient } from '@/utils/supabase/server';
import useTranslation from 'next-translate/useTranslation';
import { notFound } from 'next/navigation';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function InfrastructureOverviewPage({
  params: { wsId },
}: Props) {
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  const { t } = useTranslation('infrastructure-tabs');

  const usersLabel = t('users');
  const workspacesLabel = t('workspaces');
  const timezonesLabel = t('timezones');

  const users = await getUserCount();
  const workspaces = await getWorkspaceCount();
  const timezones = tzs.length;

  return (
    <div className="grid flex-col gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatisticCard
        title={usersLabel}
        value={users}
        href={`/${wsId}/infrastructure/users`}
      />

      <StatisticCard
        title={workspacesLabel}
        value={workspaces}
        href={`/${wsId}/infrastructure/workspaces`}
      />

      <StatisticCard
        title={timezonesLabel}
        value={timezones}
        href={`/${wsId}/infrastructure/timezones`}
      />
    </div>
  );
}

async function getUserCount() {
  const supabaseAdmin = createAdminClient();
  if (!supabaseAdmin) notFound();

  const { count } = await supabaseAdmin.from('users').select('*', {
    count: 'exact',
    head: true,
  });

  return count;
}

async function getWorkspaceCount() {
  const supabaseAdmin = createAdminClient();
  if (!supabaseAdmin) notFound();

  const { count } = await supabaseAdmin.from('workspaces').select('*', {
    count: 'exact',
    head: true,
  });

  return count;
}
