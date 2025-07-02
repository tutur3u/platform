import { createClient } from '@tuturuuu/supabase/next/server';
import { Alert, AlertTitle } from '@tuturuuu/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { AlertCircle } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { notFound } from 'next/navigation';
import { ClearDataDialog } from './clear-data-dialog';
import { DeleteDatasetDialog } from './delete-dataset-dialog';
import { ManageColumns } from './manage-columns';

interface Props {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
}

export default async function DatasetSettingsPage({ params }: Props) {
  const { wsId, datasetId } = await params;
  const dataset = await getDataset(datasetId);

  if (!dataset) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>
            Manage your dataset data, including columns and content
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>
                Warning: These actions can result in data loss
              </AlertTitle>
            </Alert>

            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-lg">Clear Data</h3>
                <p className="text-muted-foreground text-sm">
                  Remove all data while keeping the dataset structure
                </p>
              </div>
              <ClearDataDialog wsId={wsId} datasetId={dataset.id} />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-lg">Delete Dataset</h3>
                <p className="text-muted-foreground text-sm">
                  Permanently remove this dataset and all its data
                </p>
              </div>
              <DeleteDatasetDialog wsId={wsId} dataset={dataset} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Columns</CardTitle>
          <CardDescription>Manage the columns in your dataset</CardDescription>
        </CardHeader>
        <CardContent>
          <ManageColumns wsId={wsId} datasetId={dataset.id} />
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
