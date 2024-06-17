import StatisticCard from '@/components/cards/StatisticCard';
import { createClient } from '@/utils/supabase/server';
import useTranslation from 'next-translate/useTranslation';

const enabled = true;

export default async function TotalBalanceStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const supabase = createClient();
  const { t } = useTranslation();

  const { data: income } = enabled
    ? await supabase.rpc('get_workspace_wallets_income', {
        ws_id: wsId,
      })
    : { data: 0 };

  const { data: expense } = enabled
    ? await supabase.rpc('get_workspace_wallets_expense', {
        ws_id: wsId,
      })
    : { data: 0 };

  const sum = (income || 0) + (expense || 0);

  if (!enabled) return null;

  return (
    <StatisticCard
      title={t('finance-overview:total-balance')}
      value={Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
      }).format(sum || 0)}
      className="md:col-span-2"
    />
  );
}
