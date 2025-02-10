import { getColumns } from '../../../../cron/jobs/columns';
import { CronJobForm } from '../../../../cron/jobs/form';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tutur3u/supabase/next/server';
import type { WorkspaceCronJob } from '@tutur3u/types/db';
import FeatureSummary from '@tutur3u/ui/components/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/components/ui/separator';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    datasetId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function DatasetCronJobsPage({
  params,
  searchParams,
}: Props) {
  const { locale, wsId, datasetId } = await params;
  const { data, count } = await getData(wsId, datasetId, await searchParams);

  const jobs = data.map((m) => ({
    ...m,
    href: `/${wsId}/cron/jobs/${m.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle="Dataset Cron Jobs"
        singularTitle="Dataset Cron Job"
        description="Automated tasks that run on a schedule to update or process this dataset"
        createTitle="Create Cron Job"
        createDescription="Set up a new automated task for this dataset"
        form={<CronJobForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={jobs}
        namespace="cron-job-data-table"
        columnGenerator={getColumns}
        extraData={{ locale, wsId }}
        count={count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}

async function getData(
  wsId: string,
  datasetId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_cron_jobs')
    .select('*')
    .eq('dataset_id', datasetId)
    .order('name', { ascending: true, nullsFirst: false });

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
    return getData(wsId, datasetId, { q, pageSize, retry: false });
  }

  return { data, count } as unknown as {
    data: WorkspaceCronJob[];
    count: number;
  };
}
