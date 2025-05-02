import type { FinanceDashboardSearchParams } from '../finance/(dashboard)/page';
import AdvancedAnalytics from './advanced-analytics';
import AuroraActions from './aurora-actions';
import { InventoryCategoryStatistics } from './categories/inventory';
import { UsersCategoryStatistics } from './categories/users';
import CommodityComparison from './commodity-comparison';
import Dashboard from './dashboard';
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
import {
  getPermissions,
  getWorkspace,
  verifySecret,
} from '@/lib/workspace-helper';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { AuroraForecast } from '@tuturuuu/types/db';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/server/user-helper';
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

  const user = await getCurrentSupabaseUser();
  const workspace = await getWorkspace(wsId);

  const { containsPermission } = await getPermissions({
    wsId,
  });

  const forecast = await getForecast();
  const mlMetrics = await getMLMetrics();
  const statsMetrics = await getStatsMetrics();

  if (!workspace) notFound();

  if (!forecast || !mlMetrics || !statsMetrics) {
    return <LoadingStatisticCard />;
  }

  // const { data: dailyData } = await getDailyData(wsId);
  // const { data: monthlyData } = await getMonthlyData(wsId);
  // const { data: hourlyData } = await getHourlyData(wsId);

  const ENABLE_AI_ONLY = await verifySecret({
    forceAdmin: true,
    wsId,
    name: 'ENABLE_AI_ONLY',
    value: 'true',
  });

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

      {(await verifySecret({
        forceAdmin: true,
        wsId,
        name: 'ENABLE_AI',
        value: 'true',
      })) &&
        containsPermission('ai_lab') && (
          <>
            <Separator className="my-4" />
            <div className="grid grid-cols-1 gap-4">
              {user?.email?.endsWith('@tuturuuu.com') &&
                containsPermission('manage_workspace_roles') && (
                  <AuroraActions />
                )}
              <Dashboard data={forecast} />
              <PricePredictionChart data={forecast} />
              <CommodityComparison data={forecast} />
              <AdvancedAnalytics
                mlMetrics={mlMetrics}
                statisticalMetrics={statsMetrics}
              />
            </div>
          </>
        )}

      {ENABLE_AI_ONLY || (
        <>
          {' '}
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
        </>
      )}

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

async function getForecast() {
  const supabase = await createClient();

  const { data: statistical_forecast, error: statError } = await supabase
    .from('aurora_statistical_forecast')
    .select('*')
    .order('date', { ascending: true });

  if (statError) throw new Error('Error fetching statistical forecast');

  const { data: ml_forecast, error: mlError } = await supabase
    .from('aurora_ml_forecast')
    .select('*')
    .order('date', { ascending: true });

  if (mlError) throw new Error('Error fetching ML forecast');

  return {
    statistical_forecast: statistical_forecast?.map((item) => ({
      ...item,
      date: new Date(item.date).toISOString().split('T')[0],
    })),
    ml_forecast: ml_forecast?.map((item) => ({
      ...item,
      date: new Date(item.date).toISOString().split('T')[0],
    })),
  } as AuroraForecast;
}

async function getMLMetrics() {
  const supabase = await createClient();

  const { data } = await supabase.from('aurora_ml_metrics').select('*');

  return data;
}

async function getStatsMetrics() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('aurora_statistical_metrics')
    .select('*');

  return data;
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
