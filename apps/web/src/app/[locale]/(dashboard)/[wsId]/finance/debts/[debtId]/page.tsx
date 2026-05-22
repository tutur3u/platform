import { DebtLoanDetailPage } from '@tuturuuu/ui/finance/debts';
import { notFound } from 'next/navigation';
import { getWebFinanceWorkspaceContext } from '@/lib/finance-workspace-context';

interface Props {
  params: Promise<{
    wsId: string;
    debtId: string;
  }>;
}

export default async function WorkspaceDebtDetailPage({ params }: Props) {
  const { wsId: id, debtId } = await params;
  const context = await getWebFinanceWorkspaceContext(id);
  if (!context) notFound();

  return <DebtLoanDetailPage wsId={context.wsId} debtId={debtId} />;
}
