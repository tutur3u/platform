import { BarChart, FileText, RefreshCw, Upload } from '@tuturuuu/icons';
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
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { DuplicateHandler } from './components/duplicate-handler';
import { DatasetCrawler } from './explore/dataset-crawler';
import { getDatasetMetrics } from './utils';

export const metadata: Metadata = {
  title: 'Dataset Details',
  description:
    'Manage Dataset Details in the Datasets area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    datasetId: string;
  }>;
}

export default async function DatasetDetailsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, datasetId }) => {
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

        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-bold text-2xl">{dataset.name}</h1>
                <p className="text-muted-foreground text-sm">
                  {dataset.description || 'No description provided'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <DatasetCrawler wsId={wsId} dataset={dataset}>
                  <Button variant="outline">
                    <Upload className="mr-2 h-4 w-4" />
                    Import Data
                  </Button>
                </DatasetCrawler>
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
                  <CardTitle className="font-medium text-sm">
                    Total Columns
                  </CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">{totalColumns}</div>
                  <p className="text-muted-foreground text-xs">
                    Number of columns in the dataset
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Total Rows
                  </CardTitle>
                  <BarChart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">{totalRows}</div>
                  <p className="text-muted-foreground text-xs">
                    Number of rows in the dataset
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">
                    Last Updated
                  </CardTitle>
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl">
                    {lastUpdated
                      ? moment(lastUpdated).format('DD/MM/YYYY HH:mm')
                      : '-'}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Time since last data update
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-medium text-sm">Status</CardTitle>
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="font-bold text-2xl capitalize">Active</div>
                  <p className="text-muted-foreground text-xs">
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
                  <div className="font-medium text-sm">Actions</div>
                  <div className="flex items-center gap-2">
                    <DuplicateHandler wsId={wsId} datasetId={datasetId} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
