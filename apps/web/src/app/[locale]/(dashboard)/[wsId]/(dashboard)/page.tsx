import { createClient } from '@tuturuuu/supabase/next/server';
import type { AuroraForecast } from '@tuturuuu/types/db';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getWorkspace, verifySecret } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import type { FinanceDashboardSearchParams } from '../finance/(dashboard)/page';
import { InventoryCategoryStatistics } from './categories/inventory';
import { UsersCategoryStatistics } from './categories/users';
import FinanceStatistics from './finance';
import {
  BatchesStatistics,
  InventoryProductsStatistics,
  ProductCategoriesStatistics,
  ProductsStatistics,
  PromotionsStatistics,
  SuppliersStatistics,
  UnitsStatistics,
  UserGroupsStatistics,
  UserGroupTagsStatistics,
  UserReportsStatistics,
  UsersStatistics,
  WarehousesStatistics,
} from './statistics';

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
            <span className="font-semibold text-foreground underline">
              {workspace.name || t('common.untitled')}
            </span>{' '}
            {t('ws-home.description_p2')}
          </>
        }
      />

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
