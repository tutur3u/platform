import StatisticCard from '@/components/cards/StatisticCard';
import { getPermissions } from '@/lib/workspace-helper';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getTranslations } from 'next-intl/server';

export default async function UsersStatistics({
  wsId,
}: {
  wsId: string;
  redirect?: boolean;
}) {
  const supabase = await createClient();
  const t = await getTranslations();

  const enabled = true;

  const { count: users } = enabled
    ? await supabase
        .from('workspace_users')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  const { permissions } = await getPermissions({
    wsId,
  });

  if (!enabled || !permissions.includes('manage_users')) return null;

  return (
    <StatisticCard
      title={t('sidebar_tabs.users')}
      value={users}
      href={`/${wsId}/users/database`}
    />
  );
}
