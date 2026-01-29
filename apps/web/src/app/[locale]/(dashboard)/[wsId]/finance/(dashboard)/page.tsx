import FinancePage from '@tuturuuu/ui/finance/finance-page';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import {
  getWorkspace,
  getWorkspaceConfig,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Finance',
  description: 'Manage Finance in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<FinanceDashboardSearchParams>;
}

export default async function WorkspaceFinancePage({
  params,
  searchParams,
}: Props) {
  const { wsId: id } = await params;

  const [sp, workspace] = await Promise.all([searchParams, getWorkspace(id)]);
  const wsId = workspace.id;

  // Fetch currency from workspace config
  const currency = await getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY');

  return (
    <FinancePage
      wsId={wsId}
      searchParams={sp}
      currency={currency || 'USD'}
      isPersonalWorkspace={workspace.personal}
    />
  );
}
