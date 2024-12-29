import type { FinanceDashboardSearchParams } from '../finance/(dashboard)/page';
import AdvancedAnalytics from './advanced-analytics';
import { InventoryCategoryStatistics } from './categories/inventory';
import { UsersCategoryStatistics } from './categories/users';
import CommodityComparison from './commodity-comparison';
import DashboardChart from './dashboard';
import FinanceStatistics from './finance';
import PricePredictionChart from './price-prediction-chart';
import {
  BatchesStatistics,
  InventoryProductsStatistics,
  ProductCategoriesStatistics,
  ProductsStatistics,
  PromotionsStatistics,
  SuppliersStatistics,
  UnitsStatistics,
  UserGroupTagsStatistics,
  UserGroupsStatistics,
  UserReportsStatistics,
  UsersStatistics,
  WarehousesStatistics,
} from './statistics';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import { getPermissions, getWorkspace } from '@/lib/workspace-helper';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<FinanceDashboardSearchParams>;
}

export default async function WorkspaceHomePage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId } = await params;
  const workspace = await getWorkspace(wsId);

  const { containsPermission } = await getPermissions({
    wsId,
  });

  if (!workspace) notFound();

  // const { data: dailyData } = await getDailyData(wsId);
  // const { data: monthlyData } = await getMonthlyData(wsId);
  // const { data: hourlyData } = await getHourlyData(wsId);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-home.home')}
        description={
          <>
            {t('ws-home.description_p1')}{' '}
            <span className="text-foreground font-semibold underline">
              {workspace.name || t('common.untitled')}
            </span>{' '}
            {t('ws-home.description_p2')}
          </>
        }
      />

      {containsPermission('ai_lab') && (
        <>
          <Separator className="my-4" />
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-4">
              <DashboardChart />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <PricePredictionChart />
                <CommodityComparison />
              </div>
              <AdvancedAnalytics />
            </div>
          </div>
        </>
      )}

      <Separator className="my-4" />
      <FinanceStatistics wsId={wsId} searchParams={searchParams} />
      <InventoryCategoryStatistics wsId={wsId} />

      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<LoadingStatisticCard />}>
          <ProductsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <InventoryProductsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <ProductCategoriesStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <BatchesStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <WarehousesStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <UnitsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <SuppliersStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <PromotionsStatistics wsId={wsId} />
        </Suspense>
      </div>

      <UsersCategoryStatistics wsId={wsId} />

      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<LoadingStatisticCard />}>
          <UsersStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <UserGroupsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <UserGroupTagsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <UserReportsStatistics wsId={wsId} />
        </Suspense>
      </div>

      {/* {containsPermission('manage_workspace_roles') &&
        wsId === ROOT_WORKSPACE_ID && (
          <Suspense
            fallback={<LoadingStatisticCard className="col-span-full" />}
          >
            <div className="col-span-full mb-32">
              <Separator className="my-4" />
              <HourlyTotalChart data={hourlyData} />
              <Separator className="my-4" />
              <DailyTotalChart data={dailyData} />
              <Separator className="my-4" />
              <MonthlyTotalChart data={monthlyData} />
            </div>
          </Suspense>
        )} */}
    </>
  );
}

// async function getHourlyData(wsId: string) {
//   if (wsId !== ROOT_WORKSPACE_ID) return { data: [], count: 0 };
//   const supabase = await createAdminClient();

//   const queryBuilder = supabase.rpc('get_hourly_prompt_completion_tokens', {
//     past_hours: 24,
//   });

//   const { data, error, count } = await queryBuilder;
//   if (error) throw error;

//   return { data, count };
// }

// async function getDailyData(wsId: string) {
//   if (wsId !== ROOT_WORKSPACE_ID) return { data: [], count: 0 };
//   const supabase = await createAdminClient();

//   const queryBuilder = supabase.rpc('get_daily_prompt_completion_tokens');

//   const { data, error, count } = await queryBuilder;
//   if (error) throw error;

//   return { data, count };
// }

// async function getMonthlyData(wsId: string) {
//   if (wsId !== ROOT_WORKSPACE_ID) return { data: [], count: 0 };
//   const supabase = await createAdminClient();

//   const queryBuilder = supabase.rpc('get_monthly_prompt_completion_tokens');

//   const { data, error, count } = await queryBuilder;
//   if (error) throw error;

//   return { data, count };
// }
