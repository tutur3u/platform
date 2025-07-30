import { getColumns } from './columns';
import { CostExport } from './components/cost-export';
import { CostManagement } from './components/cost-management';
import { ExecutionCharts } from './components/execution-charts';
import { AIExecutionAnalyticsService } from './services/analytics-service';
import { CustomDataTable } from '@/components/custom-data-table';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type WorkspaceAIExecution } from '@tuturuuu/types/db';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

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
  const t = await getTranslations();
  const { locale, wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_workspace_roles')) {
    return <div>You are not allowed to access this page</div>;
  }

  // Fetch data in parallel for better performance
  const [executionData, analyticsData, allTimeStats] = await Promise.all([
    getData(wsId, await searchParams),
    AIExecutionAnalyticsService.getLast30DaysStats(wsId),
    AIExecutionAnalyticsService.getAllTimeStats(wsId), // Get all-time stats for total counts
  ]);

  console.log(executionData, analyticsData, allTimeStats);

  const { data, count } = executionData;
  const executions = data.map((e) => ({
    ...e,
    href: `/${wsId}/ai/executions/${e.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-ai-executions.plural')}
        singularTitle={t('ws-ai-executions.singular')}
        description={t('ws-ai-executions.description')}
      />
      <Separator className="my-4" />
      <ExecutionCharts
        executions={data}
        analyticsData={{
          ...analyticsData,
          summary: allTimeStats.summary, // Use all-time summary for total counts
        }}
      />
      <Separator className="my-4" />
      <CostManagement
        executions={data}
        analyticsData={{
          ...analyticsData,
          summary: allTimeStats.summary, // Use all-time summary for total counts
        }}
      />
      <Separator className="my-4" />
      <CostExport executions={data} />
      <Separator className="my-4" />
      <CustomDataTable
        data={executions}
        namespace="ai-execution-data-table"
        columnGenerator={getColumns}
        extraData={{ locale, wsId }}
        count={count}
        defaultVisibility={{ id: false }}
      />
    </>
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
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
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
