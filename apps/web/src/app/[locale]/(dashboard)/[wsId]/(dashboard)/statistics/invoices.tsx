import { FinanceDashboardSearchParams } from '../../finance/(dashboard)/page';
import StatisticCard from '@/components/cards/StatisticCard';
import { getPermissions } from '@/lib/workspace-helper';
import { createClient } from '@/utils/supabase/server';
import { getTranslations } from 'next-intl/server';

const enabled = true;

export default async function InvoicesStatistics({
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
      .from('finance_invoices')
      .select('*', {
        count: 'exact',
        head: true,
      })
      .eq('ws_id', wsId);

    if (startDate) query.gte('created_at', startDate);
    if (endDate) query.lte('created_at', endDate);

    return query;
  };

  const { count: invoicesCount } = enabled ? await getData() : { count: 0 };

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
      title={t('workspace-finance-tabs.invoices')}
      value={invoicesCount}
      href={`/${wsId}/finance/invoices`}
    />
  );
}
