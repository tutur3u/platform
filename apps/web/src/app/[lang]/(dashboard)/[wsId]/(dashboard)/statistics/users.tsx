import StatisticCard from '@/components/cards/StatisticCard';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { createClient } from '@/utils/supabase/server';
import useTranslation from 'next-translate/useTranslation';

export default async function UsersStatistics({
  wsId,
  redirect = false,
}: {
  wsId: string;
  redirect?: boolean;
}) {
  const supabase = createClient();
  const { t } = useTranslation();

  const enabled = await verifyHasSecrets(
    wsId,
    ['ENABLE_USERS'],
    redirect ? `/${wsId}` : undefined
  );

  const { count: users } = enabled
    ? await supabase
        .from('workspace_users')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title={t('sidebar-tabs:users')}
      value={users}
      href={`/${wsId}/users/database`}
    />
  );
}
