import { secretColumns } from './columns';
import SecretForm from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@repo/supabase/next/server';
import { WorkspaceSecret } from '@repo/types/primitives/WorkspaceSecret';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function WorkspaceSecretsPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  const { data: secrets, count } = await getSecrets(wsId, await searchParams);
  const t = await getTranslations();

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-secrets.plural')}
        singularTitle={t('ws-secrets.singular')}
        description={t('ws-secrets.description')}
        createTitle={t('ws-secrets.create')}
        createDescription={t('ws-secrets.create_description')}
        form={<SecretForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        columnGenerator={secretColumns}
        namespace="secret-data-table"
        data={secrets}
        count={count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}

async function getSecrets(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_secrets')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('name', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceSecret[]; count: number };
}
