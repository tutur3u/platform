import { getColumns } from '../columns';
import ModelForm from '../form';
import { CustomDataTable } from '@/components/custom-data-table';
import type { WorkspaceDataset } from '@/types/db';
import { createClient } from '@repo/supabase/next/server';
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
          description: false,
          url: false,
          created_at: false,
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
  try {
    const supabase = await createClient();

    const queryBuilder = supabase
      .from('workspace_datasets')
      .select(
        '*, workspace_dataset_columns(id.count()), workspace_dataset_rows(id.count())'
      )
      .order('name', { ascending: true, nullsFirst: false })
      .eq('ws_id', wsId);

    if (page && pageSize) {
      const parsedPage = parseInt(page);
      const parsedSize = parseInt(pageSize);
      const start = (parsedPage - 1) * parsedSize;
      const end = parsedPage * parsedSize;
      queryBuilder.range(start, end).limit(parsedSize);
    }

    const { data, error, count } = await queryBuilder;

    if (error) {
      console.error('Error fetching datasets:', error);
      if (!retry) throw error;
      return getData(wsId, { q, pageSize, retry: false });
    }

    // Add input validation
    if (!data || !Array.isArray(data)) {
      throw new Error('Invalid data format received');
    }

    return {
      data: data.map(
        ({ workspace_dataset_columns, workspace_dataset_rows, ...rest }) => ({
          ...rest,
          columns: workspace_dataset_columns?.[0]?.count ?? 0,
          rows: workspace_dataset_rows?.[0]?.count ?? 0,
        })
      ),
      count: count ?? 0,
    } as unknown as {
      data: (WorkspaceDataset & {
        columns: number;
        rows: number;
      })[];
      count: number;
    };
  } catch (error) {
    console.error('Failed to fetch datasets:', error);
    throw error;
  }
}
