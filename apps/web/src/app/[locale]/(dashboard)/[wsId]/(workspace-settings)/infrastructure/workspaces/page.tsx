import { Separator } from '@tuturuuu/ui/separator';
import { enforceRootWorkspaceAdmin } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  getWorkspaceOverview,
  getWorkspaceOverviewSummary,
} from './data-fetching';
import SummaryCards from './summary-cards';
import { WorkspacesTable } from './workspaces-table';

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
    tier?: string;
    status?: string;
    workspaceType?: string;
    subCount?: string;
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

  const t = await getTranslations('ws-overview');
  const sp = await searchParams;

  const [summary, { data: workspaces, count }] = await Promise.all([
    getWorkspaceOverviewSummary(),
    getWorkspaceOverview({
      search: sp.q,
      page: sp.page,
      pageSize: sp.pageSize,
      tier: sp.tier,
      status: sp.status,
      workspaceType: sp.workspaceType,
      subCount: sp.subCount,
    }),
  ]);

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
        <div>
          <h1 className="font-bold text-2xl">{t('title')}</h1>
          <p className="text-foreground/80">{t('description')}</p>
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
      <SummaryCards summary={summary} />
      <Separator className="my-4" />
      <WorkspacesTable data={workspaces} count={count} />
    </>
  );
}
