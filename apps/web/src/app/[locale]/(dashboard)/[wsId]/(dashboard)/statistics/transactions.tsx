import { FinanceDashboardSearchParams } from '../../finance/(dashboard)/page';
import StatisticCard from '@/components/cards/StatisticCard';
import { getPermissions } from '@/lib/workspace-helper';
import { createClient } from '@/utils/supabase/server';
import { getTranslations } from 'next-intl/server';

const enabled = true;

export default async function TransactionsStatistics({
  wsId,
  searchParams: { startDate, endDate },
}: {
  wsId: string;
  searchParams: FinanceDashboardSearchParams;
}) {
  const supabase = createClient();
  const t = await getTranslations();

  const getData = async () => {
    const query = supabase
      .from('wallet_transactions')
      .select('*, workspace_wallets!inner(ws_id)', {
        count: 'exact',
        head: true,
      })
      .eq('workspace_wallets.ws_id', wsId);

    if (startDate) query.gte('created_at', startDate);
    if (endDate) query.lte('created_at', endDate);

    return query;
  };

  const { count: transactionsCount } = enabled ? await getData() : { count: 0 };

  const { permissions } = await getPermissions({
    wsId,
    requiredPermissions: [
      'ai_chat',
      'ai_lab',
      'manage_calendar',
      'manage_projects',
      'manage_documents',
      'manage_drive',
      'manage_users',
      'manage_inventory',
      'manage_finance',
    ],
  });

  if (!enabled || !permissions.includes('manage_finance')) return null;

  return (
    <StatisticCard
      title={t('workspace-finance-tabs.transactions')}
      value={transactionsCount}
      href={`/${wsId}/finance/transactions`}
    />
  );
}
