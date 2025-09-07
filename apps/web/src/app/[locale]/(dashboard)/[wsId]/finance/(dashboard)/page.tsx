import FinancePage from '@tuturuuu/ui/finance/finance-page';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

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
  const sp = await searchParams;

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  return <FinancePage wsId={wsId} searchParams={sp} />;
}
