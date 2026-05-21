import { DebtLoanDetailPage } from '@tuturuuu/ui/finance/debts';
import { notFound } from 'next/navigation';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
    debtId: string;
  }>;
}

export default async function WorkspaceDebtDetailPage({ params }: Props) {
  const { wsId: id, debtId } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) notFound();

  return <DebtLoanDetailPage wsId={context.wsId} debtId={debtId} />;
}
