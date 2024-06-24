import StatisticCard from '@/components/cards/StatisticCard';
import { createClient } from '@/utils/supabase/server';
import { useTranslations } from 'next-intl';

const enabled = true;

export default async function TransactionCategoriesStatistics({
  wsId,
}: {
  wsId: string;
}) {
  const supabase = createClient();
  const t = useTranslations();

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
