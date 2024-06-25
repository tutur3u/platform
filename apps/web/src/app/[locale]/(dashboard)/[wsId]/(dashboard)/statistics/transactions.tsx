import StatisticCard from '@/components/cards/StatisticCard';
import { createClient } from '@/utils/supabase/server';
import { getTranslations } from 'next-intl/server';

const enabled = true;

export default async function TransactionsStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const supabase = createClient();
  const t = await getTranslations();

  const { count: transactionsCount } = enabled
    ? await supabase
        .from('wallet_transactions')
        .select('*, workspace_wallets!inner(ws_id)', {
          count: 'exact',
          head: true,
        })
        .eq('workspace_wallets.ws_id', wsId)
    : { count: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title={t('workspace-finance-tabs.transactions')}
      value={transactionsCount}
      href={`/${wsId}/finance/transactions`}
    />
  );
}
