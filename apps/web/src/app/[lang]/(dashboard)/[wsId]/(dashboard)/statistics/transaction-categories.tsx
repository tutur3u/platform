import StatisticCard from '@/components/cards/StatisticCard';
import { createClient } from '@/utils/supabase/server';
import useTranslation from 'next-translate/useTranslation';

const enabled = true;

export default async function TransactionCategoriesStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const supabase = createClient();
  const { t } = useTranslation();

  const { count: categoriesCount } = enabled
    ? await supabase
        .from('transaction_categories')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title={t('workspace-finance-tabs:categories')}
      value={categoriesCount}
      href={`/${wsId}/finance/transactions/categories`}
    />
  );
}
