import FinancePage from '@tuturuuu/ui/finance/finance-page';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';

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
  const { wsId } = await params;
  const sp = await searchParams;

  return <FinancePage wsId={wsId} searchParams={sp} />;
}
