import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api';
import FinancePage from '@tuturuuu/ui/finance/finance-page';
import type { FinanceDashboardSearchParams } from '@tuturuuu/ui/finance/shared/metrics';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

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
  await connection();

  const { wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) notFound();
  const sp = await searchParams;
  const internalApiOptions = withForwardedInternalApiAuth(await headers());
  return (
    <FinancePage
      wsId={context.wsId}
      searchParams={sp}
      currency={context.currency}
      financePrefix=""
      internalApiOptions={internalApiOptions}
      isPersonalWorkspace={!!context.workspace.personal}
      permissions={context.permissions}
    />
  );
}
