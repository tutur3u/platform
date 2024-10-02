import StatisticCard from '../../../../../../components/cards/StatisticCard';
import tzs from '@/data/timezones.json';
import { enforceRootWorkspaceAdmin } from '@/lib/workspace-helper';
import { createAdminClient } from '@/utils/supabase/server';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InfrastructureOverviewPage({ params }: Props) {
  const { wsId } = await params;
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  const t = await getTranslations('infrastructure-tabs');

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
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) notFound();

  const { count } = await supabaseAdmin.from('users').select('*', {
    count: 'exact',
    head: true,
  });

  return count;
}

async function getWorkspaceCount() {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) notFound();

  const { count } = await supabaseAdmin.from('workspaces').select('*', {
    count: 'exact',
    head: true,
  });

  return count;
}
