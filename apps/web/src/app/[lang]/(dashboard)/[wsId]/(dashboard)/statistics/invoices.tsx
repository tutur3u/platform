import StatisticCard from '@/components/cards/StatisticCard';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import useTranslation from 'next-translate/useTranslation';
import { cookies } from 'next/headers';

const enabled = true;

export default async function InvoicesStatistics({ wsId }: { wsId: string }) {
  const supabase = createServerComponentClient({ cookies });
  const { t } = useTranslation();

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
      title={t('workspace-finance-tabs:invoices')}
      value={invoicesCount}
      href={`/${wsId}/finance/invoices`}
    />
  );
}
