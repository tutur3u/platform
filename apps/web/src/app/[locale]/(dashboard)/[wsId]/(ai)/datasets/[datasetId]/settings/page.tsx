import { ManageColumns } from '../manage-columns';
import { createClient } from '@/utils/supabase/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface Props {
  params: {
    wsId: string;
    datasetId: string;
  };
}

export default async function DatasetSettingsPage({
  params: { wsId, datasetId },
}: Props) {
  const t = await getTranslations();
  const dataset = await getDataset(datasetId);

  if (!dataset) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('common.columns')}</CardTitle>
          <CardDescription>
            {t('ws-datasets.columns_description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ManageColumns wsId={wsId} datasetId={datasetId} />
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
