import { DataExplorer } from './data-explorer';
import { createClient } from '@/utils/supabase/server';
import { Card, CardContent } from '@repo/ui/components/ui/card';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
}

export default async function ExploreDatasetPage({ params }: Props) {
  const { wsId, datasetId } = await params;
  const dataset = await getDataset(datasetId);

  if (!dataset) {
    notFound();
  }

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
    .single();

  return data;
}
