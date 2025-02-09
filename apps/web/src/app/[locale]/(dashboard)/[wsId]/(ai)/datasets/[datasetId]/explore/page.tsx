import { DataExplorer } from './data-explorer';
import { Card, CardContent } from '@repo/ui/components/ui/card';
import { createClient } from '@tutur3u/supabase/next/server';
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
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('workspace_datasets')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching dataset:', error);
      throw error;
    }

    if (!data) {
      console.error('Dataset not found:', id);
      notFound();
    }

    // Validate required fields
    if (!data.name || !data.id) {
      throw new Error('Invalid dataset format');
    }

    return data;
  } catch (error) {
    console.error('Failed to fetch dataset:', error);
    throw error;
  }
}
