import { createClient } from '@tuturuuu/supabase/next/server';
import { Card, CardContent } from '@tuturuuu/ui/card';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DataExplorer } from './data-explorer';

export const metadata: Metadata = {
  title: 'Explore',
  description: 'Manage Explore in the Dataset area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
}

export default async function ExploreDatasetPage({ params }: Props) {
  const { wsId, datasetId } = await params;
  const dataset = await getDataset(datasetId);

  if (!dataset) notFound();

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <DataExplorer wsId={wsId} dataset={dataset} />
        </CardContent>
      </Card>
    </div>
  );
}

async function getDataset(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('workspace_datasets')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  return data;
}
