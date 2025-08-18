import { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics'
import FinancePage from '@tuturuuu/ui/finance/finance-page';



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

  return (
    <FinancePage wsId={wsId} searchParams={sp} />
  );
}

