import BudgetsPage from '@tuturuuu/ui/finance/budgets/budgets-page';
import {
  getWorkspace,
  getWorkspaceConfig,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Budgets',
  description: 'Manage Budgets in the Finance area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
  }>;
}

export default async function WorkspaceBudgetsPage({
  params,
  searchParams,
}: Props) {
  const { wsId: id } = await params;
  const sp = await searchParams;

  const [workspace, currency] = await Promise.all([
    getWorkspace(id),
    getWorkspaceConfig(id, 'DEFAULT_CURRENCY'),
  ]);
  if (!workspace) notFound();
  const wsId = workspace.id;

  return (
    <BudgetsPage wsId={wsId} currency={currency ?? 'USD'} searchParams={sp} />
  );
}
