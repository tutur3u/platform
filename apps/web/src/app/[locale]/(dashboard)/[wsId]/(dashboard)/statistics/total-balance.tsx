import { FinanceDashboardSearchParams } from '../../finance/(dashboard)/page';
import StatisticCard from '@/components/cards/StatisticCard';
import { getPermissions } from '@/lib/workspace-helper';
import { createClient } from '@/utils/supabase/server';
import dayjs, { OpUnitType } from 'dayjs';
import { getTranslations } from 'next-intl/server';

const enabled = true;

export default async function TotalBalanceStatistics({
  wsId,
  searchParams: { view, startDate, endDate },
}: {
  wsId: string;
  searchParams: FinanceDashboardSearchParams;
}) {
  const supabase = createClient();
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

  const { data: expense } = enabled
    ? await supabase.rpc('get_workspace_wallets_expense', {
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

  const sum = (income || 0) + (expense || 0);

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
      title={t('finance-overview.total-balance')}
      value={Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
      }).format(sum || 0)}
      className="md:col-span-2"
    />
  );
}
