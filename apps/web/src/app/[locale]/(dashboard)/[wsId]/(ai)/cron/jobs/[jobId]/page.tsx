import { getColumns } from '../../executions/columns';
import { CustomDataTable } from '@/components/custom-data-table';
import type { WorkspaceCronExecution, WorkspaceCronJob } from '@/types/db';
import { createClient } from '@repo/supabase/next/server';
import { Button } from '@repo/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import { ArrowLeft, CheckCircle, Clock, PowerOff, XCircle } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

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
          <div className="text-dynamic-green flex items-center gap-1">
            <CheckCircle className="h-5 w-5" />
            <span>Active</span>
          </div>
        );

      case 'inactive':
        return (
          <div className="text-dynamic-red flex items-center gap-1">
            <PowerOff className="h-5 w-5" />
            <span>Inactive</span>
          </div>
        );

      case 'running':
        return (
          <div className="text-dynamic-blue flex items-center gap-1">
            <Clock className="h-5 w-5" />
            <span>Running</span>
          </div>
        );

      case 'failed':
        return (
          <div className="text-dynamic-red flex items-center gap-1">
            <XCircle className="h-5 w-5" />
            <span>Failed</span>
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
            <h1 className="text-2xl font-bold">{job.name}</h1>
            <p className="text-muted-foreground text-sm">
              {job.schedule} • {job.active ? 'Active' : 'Inactive'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {renderStatus(job.active ? 'active' : 'inactive')}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Last Run</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {/* {job.last_run
                  ? moment(job.last_run).format('DD/MM/YYYY HH:mm')
                  : '-'} */}
                -
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Next Run</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {/* {job.next_run
                  ? moment(job.next_run).format('DD/MM/YYYY HH:mm')
                  : '-'} */}
                -
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Executions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{count || 0}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Executions History</CardTitle>
            <CardDescription>
              List of all executions for this cron job
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
): Promise<WorkspaceCronJob | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('workspace_cron_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('ws_id', wsId)
    .single();

  return data;
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
    .select('*')
    .eq('job_id', jobId)
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
    return getData(wsId, jobId, { q, pageSize, retry: false });
  }

  return { data, count } as unknown as {
    data: WorkspaceCronExecution[];
    count: number;
  };
}
