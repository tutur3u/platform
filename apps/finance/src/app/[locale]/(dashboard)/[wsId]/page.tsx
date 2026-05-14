import FinancePage from '@tuturuuu/ui/finance/finance-page';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import { notFound } from 'next/navigation';
import { getFinanceWorkspace } from '@/lib/workspace';

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
  const workspace = await getFinanceWorkspace(id);
  if (!workspace) notFound();
  const sp = await searchParams;
  return <FinancePage wsId={workspace.id} searchParams={sp} financePrefix="" />;
}
