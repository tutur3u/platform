import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { Button } from '@tuturuuu/ui/button';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import {
  listWorkspacesWithoutMemberManager,
  parseWorkspaceManagerGapQuery,
} from '@/lib/workspace-manager-gaps';
import { enforceInfrastructureRootWorkspace } from '../../enforce-infrastructure-root';
import { WorkspacesWithoutManagersTable } from './workspaces-without-managers-table';

export const metadata: Metadata = {
  description: 'Workspaces that have members but no member manager.',
  title: 'Workspaces without managers',
};

interface Props {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ after?: string }>;
}

export default async function WorkspacesWithoutManagersPage({
  params,
  searchParams,
}: Props) {
  await connection();
  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
  if (!permissions || permissions.withoutPermission('manage_workspace_roles')) {
    notFound();
  }

  const t = await getTranslations('workspace-manager-gaps');
  const { after } = await searchParams;
  const basePath = `/${wsId}/workspaces/without-managers`;
  const parsed = parseWorkspaceManagerGapQuery({ after: after ?? null });
  const page = parsed.ok
    ? await listWorkspacesWithoutMemberManager(
        (await createAdminClient({ noCookie: true })) as TypedSupabaseClient,
        parsed.query
      )
    : null;
  const isFirstPage = !parsed.ok || parsed.query.after === null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-bold text-2xl">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {page?.ok ? (
        <WorkspacesWithoutManagersTable rows={page.rows} />
      ) : (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
          {parsed.ok ? t('load_failed') : t('invalid_cursor')}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {!isFirstPage && (
          <Button asChild type="button" variant="outline">
            <Link href={basePath}>{t('first_page')}</Link>
          </Button>
        )}
        {page?.ok && page.nextCursor && (
          <Button asChild type="button" variant="outline">
            <Link
              href={`${basePath}?after=${encodeURIComponent(page.nextCursor)}`}
            >
              {t('next_page')}
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
