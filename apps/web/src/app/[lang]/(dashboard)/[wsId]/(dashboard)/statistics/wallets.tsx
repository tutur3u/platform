import StatisticCard from '@/components/cards/StatisticCard';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import useTranslation from 'next-translate/useTranslation';
import { cookies } from 'next/headers';

const enabled = true;

export default async function WalletsStatistics({ wsId }: { wsId: string }) {
  const supabase = createServerComponentClient({ cookies });
  const { t } = useTranslation();

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
