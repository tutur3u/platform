import { getColumns } from './columns';
import { CronJobForm } from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tutur3u/supabase/next/server';
import type { WorkspaceCronJob } from '@tutur3u/types/db';
import FeatureSummary from '@tutur3u/ui/components/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/components/ui/separator';
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

export default async function WorkspaceCronJobsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { locale, wsId } = await params;
  const { data, count } = await getData(wsId, await searchParams);

  const jobs = data.map((m) => ({
    ...m,
    href: `/${wsId}/cron/jobs/${m.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-cron-jobs.plural')}
        singularTitle={t('ws-cron-jobs.singular')}
        description={t('ws-cron-jobs.description')}
        createTitle={t('ws-cron-jobs.create')}
        createDescription={t('ws-cron-jobs.create_description')}
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
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count } as unknown as {
    data: WorkspaceCronJob[];
    count: number;
  };
}
