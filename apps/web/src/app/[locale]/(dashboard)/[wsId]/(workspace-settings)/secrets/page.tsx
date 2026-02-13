import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { secretColumns } from './columns';
import SecretForm from './form';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Secrets',
  description:
    'Manage Secrets in the Workspace Settings area of your Tuturuuu workspace.',
};

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
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  if (!workspace) notFound();
  const wsId = workspace?.id;

  // Enforce permission check - only users with manage_workspace_secrets can access
  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    enableNotFound: true,
  });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;

  if (withoutPermission('manage_workspace_secrets')) {
    throw new Error(
      'Unauthorized: manage_workspace_secrets permission required'
    );
  }

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
        form={
          <SecretForm
            wsId={wsId}
            existingSecrets={secrets
              .filter((s) => !!s.name)
              .map((s) => s.name!)}
          />
        }
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
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceSecret[]; count: number };
}
