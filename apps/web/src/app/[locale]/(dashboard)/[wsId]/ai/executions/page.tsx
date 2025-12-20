import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceAIExecution } from '@tuturuuu/types';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { CostExport } from './components/cost-export';
import { ExecutionsTable } from './components/executions-table';
import { PerformanceMetrics } from './components/performance-metrics';
import { AIExecutionAnalyticsService } from './services/analytics-service';

export const metadata: Metadata = {
  title: 'Executions',
  description: 'Manage Executions in the AI area of your Tuturuuu workspace.',
};

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceAIExecutionsPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, locale }) => {
        const t = await getTranslations();

        const { withoutPermission } = await getPermissions({
          wsId,
        });

        if (
          wsId !== ROOT_WORKSPACE_ID ||
          withoutPermission('manage_workspace_roles')
        )
          redirect(`/${wsId}`);

        // Fetch data in parallel for better performance
        const [executionData, analyticsData, allTimeStats] = await Promise.all([
          getData(wsId, await searchParams),
          AIExecutionAnalyticsService.getLast30DaysStats(wsId),
          AIExecutionAnalyticsService.getAllTimeStats(wsId), // Get all-time stats for total counts
        ]);

        const { data, count } = executionData;
        const executions = data;

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-ai-executions.plural')}
              singularTitle={t('ws-ai-executions.singular')}
              description={t('ws-ai-executions.description')}
            />
            <Separator className="my-4" />

            {/* Analytics Dashboard */}
            <div className="space-y-6">
              <PerformanceMetrics
                executions={data}
                analyticsData={{
                  ...analyticsData,
                  summary: allTimeStats.summary,
                }}
              />
            </div>

            <Separator className="my-4" />
            <CostExport executions={data} />
            <Separator className="my-4" />
            <ExecutionsTable
              executions={executions}
              count={count}
              locale={locale}
              wsId={wsId}
            />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const sbAdmin = await createAdminClient();
  const queryBuilder = sbAdmin
    .from('workspace_ai_executions')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }
  return { data, count } as {
    data: WorkspaceAIExecution[];
    count: number;
  };
}
