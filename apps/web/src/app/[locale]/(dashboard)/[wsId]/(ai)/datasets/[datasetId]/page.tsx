import { createClient } from '@/utils/supabase/server';
import { Button } from '@repo/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import { Separator } from '@repo/ui/components/ui/separator';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
}

export default async function DatasetDetailsPage({ params }: Props) {
  const { wsId, datasetId } = await params;
  const t = await getTranslations();
  const dataset = await getDataset(datasetId);

  if (!dataset) {
    notFound();
  }

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
          <h1 className="text-2xl font-bold">{dataset.name}</h1>
        </div>
      </div>

      <Separator />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('common.general')}</CardTitle>
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
                  <div className="text-sm font-semibold">URL</div>
                  <Link
                    href={dataset.url}
                    className="text-muted-foreground hover:text-foreground break-all text-sm hover:underline"
                  >
                    {dataset.url}
                  </Link>
                </div>
              )}

              {dataset.html_ids && dataset.html_ids.length > 0 && (
                <div>
                  <div className="text-sm font-semibold">HTML IDs</div>
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

              {dataset.description && (
                <div>
                  <label className="text-sm font-medium">
                    {t('ws-user-fields.description')}
                  </label>
                  <p className="text-muted-foreground text-sm">
                    {dataset.description || '-'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('ws-datasets.total_columns')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalColumns}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('ws-datasets.total_rows')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalRows}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('ws-datasets.last_updated')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.lastUpdated}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

async function getDataset(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('workspace_datasets')
    .select('*')
    .eq('id', id)
    .single();

  return data;
}

async function getDatasetMetrics(id: string) {
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

  const lastUpdated = new Date().toLocaleDateString();

  return {
    totalColumns: totalColumns || 0,
    totalRows: totalRows || 0,
    lastUpdated,
  };
}
