import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceAIModel } from '@tuturuuu/types';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getColumns } from './columns';
import ModelForm from './form';

export const metadata: Metadata = {
  title: 'Models',
  description: 'Manage Models in the AI area of your Tuturuuu workspace.',
};

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

export default async function WorkspaceModelsPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, locale }) => {
        const t = await getTranslations();
        const { data, count } = await getData(wsId, await searchParams);

        const models = data.map((m) => ({
          ...m,
          href: `/${wsId}/models/${m.id}`,
        }));

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-models.plural')}
              singularTitle={t('ws-models.singular')}
              description={t('ws-models.description')}
              createTitle={t('ws-models.create')}
              createDescription={t('ws-models.create_description')}
              form={<ModelForm wsId={wsId} />}
            />
            <Separator className="my-4" />
            <CustomDataTable
              data={models}
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
      }}
    </WorkspaceWrapper>
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
    .from('workspace_ai_models')
    .select('*')
    .order('name', { ascending: true, nullsFirst: false });

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
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
