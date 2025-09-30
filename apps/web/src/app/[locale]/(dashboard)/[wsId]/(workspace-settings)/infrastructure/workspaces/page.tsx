import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Workspace } from '@tuturuuu/types/db';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { enforceRootWorkspaceAdmin } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { workspaceColumns } from './columns';

export const metadata: Metadata = {
  title: 'Workspaces',
  description:
    'Manage Workspaces in the Infrastructure area of your Tuturuuu workspace.',
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

export default async function InfrastructureWorkspacesPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  const t = await getTranslations();
  const { data: workspaces, count } = await getWorkspaces(await searchParams);

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
        <div>
          <h1 className="font-bold text-2xl">
            {t('infrastructure-tabs.workspaces')}
          </h1>
          <p className="text-foreground/80">
            View and manage all workspaces across the platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-border bg-background px-3 py-1.5">
            <span className="font-semibold text-muted-foreground text-sm">
              Total: {count}
            </span>
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      <CustomDataTable
        columnGenerator={workspaceColumns}
        namespace="workspace-data-table"
        data={workspaces}
        count={count}
        defaultVisibility={{
          id: false,
        }}
      />
    </>
  );
}

async function getWorkspaces({
  q,
  page = '1',
  pageSize = '10',
}: {
  q?: string;
  page?: string;
  pageSize?: string;
}) {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) return { data: [], count: 0 };

  const queryBuilder = supabaseAdmin
    .from('workspaces')
    .select('*', {
      count: 'exact',
    })
    .order('created_at', { ascending: false });

  if (q) {
    queryBuilder.or(`name.ilike.%${q}%,handle.ilike.%${q}%`);
  }

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data: (data as Workspace[]) || [], count: count || 0 };
}
