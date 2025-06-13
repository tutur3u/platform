import { FinanceDashboardSearchParams } from '../../finance/(dashboard)/page';
import StatisticCard from '@/components/cards/StatisticCard';
import { getPermissions } from '@/lib/workspace-helper';
import { createClient } from '@ncthub/supabase/next/server';
import dayjs, { OpUnitType } from 'dayjs';
import { getTranslations } from 'next-intl/server';

const enabled = true;

export default async function IncomeStatistics({
  wsId,
  searchParams: { showFinanceStats = true, view, startDate, endDate } = {},
}: {
  wsId: string;
  searchParams?: FinanceDashboardSearchParams;
}) {
  const supabase = await createClient();
  const t = await getTranslations();

  const { data: income } = enabled
    ? await supabase.rpc('get_workspace_wallets_income', {
        ws_id: wsId,
        start_date:
          startDate && view
            ? dayjs(startDate)
                .startOf(view as OpUnitType)
                .toISOString()
            : undefined,
        end_date:
          endDate && view
            ? dayjs(endDate)
                .endOf(view as OpUnitType)
                .toISOString()
            : undefined,
      })
    : { data: 0 };

  const { permissions } = await getPermissions({
    wsId,
  });

  if (!enabled || !permissions.includes('manage_finance')) return null;

  return (
    <StatisticCard
      title={t('finance-overview.total-income')}
      value={
        showFinanceStats
          ? Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
              signDisplay: 'exceptZero',
            }).format(income || 0)
          : '***'
      }
    />
  );
}
