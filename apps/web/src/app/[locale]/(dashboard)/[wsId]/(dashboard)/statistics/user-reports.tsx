import StatisticCard from '@/components/cards/StatisticCard';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

export default async function UserReportsStatistics({
  wsId,
}: {
  wsId: string;
  redirect?: boolean;
}) {
  const supabase = await createClient();
  const t = await getTranslations();

  const enabled = true;

  const { count: reports } = enabled
    ? await supabase
        .from('external_user_monthly_reports')
        .select('*, user:workspace_users!user_id!inner(ws_id)', {
          count: 'exact',
          head: true,
        })
        .eq('user.ws_id', wsId)
    : { count: 0 };

  const { permissions } = await getPermissions({
    wsId,
  });

  if (!enabled || !permissions.includes('manage_users')) return null;

  return (
    <StatisticCard
      title={t('workspace-users-tabs.reports')}
      value={reports}
      href={`/${wsId}/users/reports`}
    />
  );
}
