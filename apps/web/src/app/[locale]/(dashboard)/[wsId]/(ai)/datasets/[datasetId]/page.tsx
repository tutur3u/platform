import { DuplicateHandler } from './components/duplicate-handler';
import { getDatasetMetrics } from './utils';
import { createClient } from '@tutur3u/supabase/next/server';
import type { WorkspaceDataset } from '@tutur3u/types/db';
import { Button } from '@tutur3u/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tutur3u/ui/card';
import { BarChart, FileText, RefreshCw } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    datasetId: string;
  }>;
}

export default async function DatasetDetailsPage({ params }: Props) {
  const { wsId, datasetId } = await params;

  const supabase = await createClient();
  const { data: dataset } = await supabase
    .from('workspace_datasets')
    .select('*')
    .eq('id', datasetId)
    .single();

  if (!dataset) {
    return <div>Dataset not found</div>;
  }

  const { totalColumns, totalRows, lastUpdated } =
    await getDatasetMetrics(datasetId);

  const typedDataset = dataset as WorkspaceDataset;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{typedDataset.name}</h1>
          <p className="text-sm text-muted-foreground">
            {typedDataset.description || 'No description provided'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/${wsId}/datasets/${datasetId}/explore`}>
            <Button variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              Explore Data
            </Button>
          </Link>
          <Link href={`/${wsId}/datasets/${datasetId}/settings`}>
            <Button variant="outline">Settings</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Columns</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalColumns}</div>
            <p className="text-xs text-muted-foreground">
              Number of columns in the dataset
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Rows</CardTitle>
            <BarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRows}</div>
            <p className="text-xs text-muted-foreground">
              Number of rows in the dataset
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Updated</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {lastUpdated
                ? moment(lastUpdated).format('DD/MM/YYYY HH:mm')
                : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              Time since last data update
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">Active</div>
            <p className="text-xs text-muted-foreground">
              Current dataset status
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dataset Details</CardTitle>
          <CardDescription>
            Additional information about this dataset
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Actions</div>
            <div className="flex items-center gap-2">
              <DuplicateHandler wsId={wsId} datasetId={datasetId} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
