import { roleColumns } from './columns';
import { RoleForm } from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { WorkspaceRole } from '@/types/db';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    q?: string;
    page?: string;
    pageSize?: string;
  };
}

export default async function WorkspaceRolesPage({
  params: { wsId },
  searchParams,
}: Props) {
  const { data: rawData, count } = await getRoles(wsId, searchParams);
  const t = await getTranslations();

  const data = rawData.map((role) => ({
    ...role,
    ws_id: wsId,
    user_count: 0, // TODO: get user count
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-roles.plural')}
        singularTitle={t('ws-roles.singular')}
        description={t('ws-roles.description')}
        createTitle={t('ws-roles.create')}
        createDescription={t('ws-roles.create_description')}
        form={<RoleForm wsId={wsId} />}
        requireExpansion
      />
      <Separator className="my-4" />
      <CustomDataTable
        columnGenerator={roleColumns}
        namespace="workspace-role-data-table"
        data={data}
        count={count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}

async function getRoles(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = createClient();

  const queryBuilder = supabase
    .from('workspace_roles')
    .select(
      'id, name, permissions:workspace_role_permissions(id:permission, enabled), created_at',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

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

  return { data, count } as { data: WorkspaceRole[]; count: number };
}
