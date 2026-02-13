import { createClient } from '@tuturuuu/supabase/next/server';

import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';
import { notFound } from 'next/navigation';

export default async function PermanentlyArchivedUsersStatistics({
  wsId,
}: {
  wsId: string;
  redirect?: boolean;
}) {
  const supabase = await createClient();
  const t = await getTranslations();

  const enabled = true;

  const { count: permanentlyArchivedUsers } = enabled
    ? await supabase
        .from('workspace_users')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
        .eq('archived', true)
        .is('archived_until', null)
    : { count: 0 };

  const permissions = await getPermissions({
    wsId,
  });
if (!permissions) notFound();
const { containsPermission } = permissions;

  if (!enabled || !containsPermission('manage_users')) return null;

  return (
    <StatisticCard
      title={t('workspace-users-tabs.permanently_archived')}
      value={permanentlyArchivedUsers}
      href={`/${wsId}/users/database?status=archived`}
    />
  );
}
