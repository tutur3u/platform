import StatisticCard from '@/components/cards/StatisticCard';
import { createClient } from '@/utils/supabase/server';
import { getTranslations } from 'next-intl/server';

const enabled = true;

export default async function InvoicesStatistics({ wsId }: { wsId: string }) {
  const supabase = createClient();
  const t = await getTranslations();

  const { count: invoicesCount } = enabled
    ? await supabase
        .from('finance_invoices')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', wsId)
    : { count: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title={t('workspace-finance-tabs.invoices')}
      value={invoicesCount}
      href={`/${wsId}/finance/invoices`}
    />
  );
}
