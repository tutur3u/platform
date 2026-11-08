import { Card, CardContent } from '@tuturuuu/ui/card';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { requireDatasetAccess } from '@/lib/datasets/page-access';
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
  const scope = await params;
  await requireDatasetAccess(scope.wsId, scope.datasetId);
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, datasetId }) => {
        const dataset = await getDataset(wsId, datasetId);

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
      }}
    </WorkspaceWrapper>
  );
}

async function getDataset(wsId: string, datasetId: string) {
  const { dataset } = await requireDatasetAccess(wsId, datasetId);
  return dataset;
}
