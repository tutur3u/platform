import {
  ArrowLeft,
  CheckCircle,
  Clock,
  PowerOff,
  XCircle,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import moment from 'moment';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { getColumns } from '../../executions/columns';
import type {
  ManagedWorkspaceCronExecution,
  ManagedWorkspaceCronJob,
} from '../../types';

export const metadata: Metadata = {
  title: 'Job Details',
  description:
    'Manage Job Details in the Jobs area of your Tuturuuu workspace.',
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
    datasetId: string;
    jobId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function DatasetCronJobDetailsPage({
  params,
  searchParams,
}: Props) {
  const { locale, wsId, jobId } = await params;
  const t = await getTranslations();
  const job = await getJob(wsId, jobId);

  if (!job) notFound();

  const { data, count } = await getData(wsId, jobId, await searchParams);

  const executions = data.map((e) => ({
    ...e,
    href: `/${wsId}/cron/executions/${e.id}`,
  }));

  function renderStatus(status: 'inactive' | 'active' | 'running' | 'failed') {
    switch (status) {
      case 'active':
        return (
          <div className="flex items-center gap-1 text-dynamic-green">
            <CheckCircle className="h-5 w-5" />
            <span>{t('cron-job-data-table.active')}</span>
          </div>
        );

      case 'inactive':
        return (
          <div className="flex items-center gap-1 text-dynamic-red">
            <PowerOff className="h-5 w-5" />
            <span>{t('cron-job-data-table.inactive')}</span>
          </div>
        );

      case 'running':
        return (
          <div className="flex items-center gap-1 text-dynamic-blue">
            <Clock className="h-5 w-5" />
            <span>{t('cron-job-data-table.running')}</span>
          </div>
        );

      case 'failed':
        return (
          <div className="flex items-center gap-1 text-dynamic-red">
            <XCircle className="h-5 w-5" />
            <span>{t('cron-job-data-table.failed')}</span>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/${wsId}/cron/jobs`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="font-bold text-2xl">{job.name}</h1>
            <p className="text-muted-foreground text-sm">
              {job.schedule} •{' '}
              {job.active
                ? t('cron-job-data-table.active')
                : t('cron-job-data-table.inactive')}
              {job.endpoint_url ? ` • ${job.endpoint_url}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">
                {t('cron-job-data-table.status')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">
                {renderStatus(job.active ? 'active' : 'inactive')}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">
                {t('cron-job-data-table.last_run')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">
                {job.last_run_at
                  ? moment(job.last_run_at).format('DD/MM/YYYY HH:mm')
                  : '-'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">
                {t('cron-job-data-table.next_run')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">
                {job.next_run_at
                  ? moment(job.next_run_at).format('DD/MM/YYYY HH:mm')
                  : '-'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm">
                {t('ws-cron-executions.total_executions')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl">{count || 0}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('ws-cron-executions.history')}</CardTitle>
            <CardDescription>
              {t('ws-cron-executions.history_description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomDataTable
              data={executions}
              namespace="cron-execution-data-table"
              columnGenerator={getColumns}
              extraData={{ locale, wsId }}
              count={count}
              defaultVisibility={{
                id: false,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function getJob(
  wsId: string,
  jobId: string
): Promise<ManagedWorkspaceCronJob | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('workspace_cron_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('ws_id', wsId)
    .single();

  return data as ManagedWorkspaceCronJob | null;
}

async function getData(
  wsId: string,
  jobId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_cron_executions')
    .select('*', { count: 'exact' })
    .eq('job_id', jobId)
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
    return getData(wsId, jobId, { q, pageSize, retry: false });
  }

  return { data, count } as unknown as {
    data: ManagedWorkspaceCronExecution[];
    count: number;
  };
}
