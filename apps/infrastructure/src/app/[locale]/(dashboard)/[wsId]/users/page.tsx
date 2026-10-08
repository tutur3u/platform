import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import { userColumns } from './columns';
import { getInfrastructureUsers } from './queries';

export const metadata: Metadata = {
  title: 'Users',
  description:
    'Manage Users in the Infrastructure area of your Tuturuuu workspace.',
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

export default async function InfrastructureUsersPage({
  params,
  searchParams,
}: Props) {
  await connection();
  const { wsId } = await params;
  const { data: users, count } = await getInfrastructureUsers(
    await searchParams,
    {
      authorize: async () => {
        const user = await getSatelliteAppSessionUser('infra');
        if (!user?.id) redirect('/login');
        await enforceInfrastructureRootWorkspace(wsId);
        const permissions = await getPermissions({
          user,
          wsId: ROOT_WORKSPACE_ID,
        });
        if (
          !permissions ||
          permissions.withoutPermission('view_infrastructure')
        )
          notFound();
        const workspace = await getWorkspace(ROOT_WORKSPACE_ID, {
          useAdmin: true,
          user,
        });
        if (!workspace) notFound();
        if (!workspace.joined) redirect('/');
      },
      createAdminClient,
    }
  );
  const t = await getTranslations();

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
        <div>
          <h1 className="font-bold text-2xl">
            {t('infrastructure-tabs.users')}
          </h1>
          <p className="text-foreground/80">
            View and manage all registered users in the platform.
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
        columnGenerator={userColumns}
        namespace="user-data-table"
        data={users}
        count={count}
        defaultVisibility={{
          id: false,
        }}
      />
    </>
  );
}
