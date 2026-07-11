import { createAdminClient } from '@tuturuuu/supabase/next/server';
import StatisticCard from '@tuturuuu/ui/custom/statistic-card';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

export default async function UserReportsStatistics({
  wsId,
}: {
  wsId: string;
  redirect?: boolean;
}) {
  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema('private');
  const t = await getTranslations();

  const enabled = true;

  const { count: reports } = enabled
    ? await privateDb
        .from('external_user_monthly_reports_workspace_view')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('user_ws_id', wsId)
    : { count: 0 };

  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!enabled || !containsPermission('manage_users')) return null;

  return (
    <StatisticCard
      title={t('workspace-users-tabs.reports')}
      value={reports}
      href={`/${wsId}/users/reports`}
    />
  );
}
