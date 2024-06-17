import StatisticCard from '@/components/cards/StatisticCard';
import { createClient } from '@/utils/supabase/server';
import useTranslation from 'next-translate/useTranslation';

const enabled = true;

export default async function ExpenseStatistics({ wsId }: { wsId: string }) {
  const supabase = createClient();
  const { t } = useTranslation();

  const { data: expense } = enabled
    ? await supabase.rpc('get_workspace_wallets_expense', {
        ws_id: wsId,
      })
    : { data: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title={t('finance-overview:total-expense')}
      value={Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        signDisplay: 'exceptZero',
      }).format(expense || 0)}
    />
  );
}
