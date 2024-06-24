import StatisticCard from '@/components/cards/StatisticCard';
import { createClient } from '@/utils/supabase/server';
import { useTranslations } from 'next-intl';

const enabled = true;

export default async function WalletsStatistics({ wsId }: { wsId: string }) {
  const supabase = createClient();
  const t = useTranslations();

  const { count: walletsCount } = enabled
    ? await supabase
        .from('workspace_wallets')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title={t('workspace-finance-tabs:wallets')}
      value={walletsCount}
      href={`/${wsId}/finance/wallets`}
    />
  );
}
