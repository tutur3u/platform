import { getColumns } from './columns';
import ModelForm from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import type { WorkspaceAIModel } from '@/types/db';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceDatasetsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { locale, wsId } = await params;
  const { data, count } = await getData(wsId, await searchParams);

  const datasets = data.map((m) => ({
    ...m,
    href: `/${wsId}/datasets/${m.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-datasets.plural')}
        singularTitle={t('ws-datasets.singular')}
        description={t('ws-datasets.description')}
        createTitle={t('ws-datasets.create')}
        createDescription={t('ws-datasets.create_description')}
        form={<ModelForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={datasets}
        namespace="user-data-table"
        columnGenerator={getColumns}
        extraData={{ locale, wsId }}
        count={count}
        defaultVisibility={{
          id: false,
        }}
      />
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_datasets')
    .select('*')
    .order('name', { ascending: true, nullsFirst: false });

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count } as unknown as {
    data: WorkspaceAIModel[];
    count: number;
  };
}
