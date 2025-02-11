import { getColumns } from '../columns';
import ModelForm from '../form';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tutur3u/supabase/next/server';
import FeatureSummary from '@tutur3u/ui/components/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/components/ui/separator';
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

export default async function WorkspacePipelinesPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { locale, wsId } = await params;
  const { data, count } = await getData(wsId, await searchParams);

  const pipelines = data.map((m) => ({
    ...m,
    href: `/${wsId}/datasets/${m.id}`,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-pipelines.plural')}
        singularTitle={t('ws-pipelines.singular')}
        description={t('ws-pipelines.description')}
        createTitle={t('ws-pipelines.create')}
        createDescription={t('ws-pipelines.create_description')}
        form={<ModelForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={pipelines}
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
      .from('workspace_crawlers')
      .select('*')
      .order('created_at', { ascending: true })
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
      console.error('Error fetching crawlers:', error);
      if (!retry) throw error;
      return getData(wsId, { q, pageSize, retry: false });
    }

    return {
      data,
      count: count ?? 0,
    };
  } catch (error) {
    console.error('Failed to fetch crawlers:', error);
    throw error;
  }
}
