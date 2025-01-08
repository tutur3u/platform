import { DatasetCharts } from './components/dataset-charts';
import { createClient } from '@/utils/supabase/server';
import { Button } from '@repo/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  FileSpreadsheet,
  Settings,
  Table,
  Timer,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
}

interface Dataset {
  id: string;
  name: string;
  description: string | null;
  type: 'excel' | 'csv' | 'html';
  url: string | null;
  html_ids: string[] | null;
  ws_id: string;
  created_at: string;
  status?: string;
}

interface DatasetMetrics {
  totalColumns: number;
  totalRows: number;
  lastUpdated: string;
  rowsOverTime: Array<{
    date: string;
    rows: number;
  }>;
  columnTypes: Array<{
    type: string;
    count: number;
  }>;
}

export default async function DatasetDetailsPage({ params }: Props) {
  const { wsId, datasetId } = await params;
  const dataset = await getDataset(datasetId, wsId);

  if (!dataset) notFound();

  const metrics = await getDatasetMetrics(datasetId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/${wsId}/datasets`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{dataset.name}</h1>
            {dataset.description && (
              <p className="text-muted-foreground mt-1 text-sm">
                {dataset.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/${wsId}/datasets/${datasetId}/explore`}>
            <Button>
              <Table className="mr-2 h-4 w-4" />
              Explore Data
            </Button>
          </Link>
          <Link href={`/${wsId}/datasets/${datasetId}/settings`}>
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Columns
              </CardTitle>
              <Table className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalColumns}</div>
              <p className="text-muted-foreground text-xs">
                Number of columns in the dataset
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Rows</CardTitle>
              <FileSpreadsheet className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalRows}</div>
              <p className="text-muted-foreground text-xs">
                Number of rows in the dataset
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Last Updated
              </CardTitle>
              <Timer className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.lastUpdated}</div>
              <p className="text-muted-foreground text-xs">
                Time since last data update
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
              <Upload className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">
                {dataset.status || 'Active'}
              </div>
              <p className="text-muted-foreground text-xs">
                Current dataset status
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              Additional information about the dataset
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold">Type</div>
                <p className="text-muted-foreground text-sm capitalize">
                  {dataset.type || 'excel'}
                </p>
              </div>

              {dataset.url && (
                <div>
                  <div className="text-sm font-semibold">Source URL</div>
                  <Link
                    href={dataset.url}
                    className="text-muted-foreground hover:text-foreground break-all text-sm hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {dataset.url}
                  </Link>
                </div>
              )}

              {dataset.html_ids && dataset.html_ids.length > 0 && (
                <div>
                  <div className="text-sm font-semibold">HTML Elements</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {dataset.html_ids.map((id, index) => (
                      <div
                        key={index}
                        className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-sm"
                      >
                        {id}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <DatasetCharts
          rowsOverTime={metrics.rowsOverTime}
          columnTypes={metrics.columnTypes}
        />
      </div>
    </div>
  );
}

async function getDataset(id: string, wsId: string): Promise<Dataset | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('workspace_datasets')
    .select('*')
    .eq('id', id)
    .eq('ws_id', wsId)
    .single();

  return data;
}

async function getDatasetMetrics(id: string): Promise<DatasetMetrics> {
  const supabase = await createClient();

  // Get total columns
  const { count: totalColumns } = await supabase
    .from('workspace_dataset_columns')
    .select('*', { count: 'exact' })
    .eq('dataset_id', id);

  // Get total rows
  const { count: totalRows } = await supabase
    .from('workspace_dataset_rows')
    .select('*', { count: 'exact' })
    .eq('dataset_id', id);

  // Get last updated timestamp from the most recent row
  const { data: lastRow } = await supabase
    .from('workspace_dataset_rows')
    .select('created_at')
    .eq('dataset_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const lastUpdated = lastRow
    ? formatDistanceToNow(new Date(lastRow.created_at), { addSuffix: true })
    : 'Never';

  // Get rows over time data
  const { data: rows } = await supabase
    .from('workspace_dataset_rows')
    .select('created_at')
    .eq('dataset_id', id)
    .order('created_at', { ascending: true });

  const rowsOverTime = rows
    ? rows.reduce((acc: any[], row: any) => {
        const date = new Date(row.created_at).toISOString().split('T')[0];
        const lastEntry = acc[acc.length - 1];

        if (lastEntry && lastEntry.date === date) {
          lastEntry.rows += 1;
        } else {
          acc.push({ date, rows: (lastEntry?.rows || 0) + 1 });
        }

        return acc;
      }, [])
    : [];

  // Get column types distribution
  const { data: columns } = await supabase
    .from('workspace_dataset_columns')
    .select('type')
    .eq('dataset_id', id);

  const columnTypes = columns
    ? columns.reduce((acc: any[], column: any) => {
        const type = column.type || 'unknown';
        const existingType = acc.find((t) => t.type === type);

        if (existingType) {
          existingType.count += 1;
        } else {
          acc.push({ type, count: 1 });
        }

        return acc;
      }, [])
    : [];

  return {
    totalColumns: totalColumns || 0,
    totalRows: totalRows || 0,
    lastUpdated,
    rowsOverTime,
    columnTypes,
  };
}
