import { DebtLoanDetailPage } from '@tuturuuu/ui/finance/debts';
import { notFound } from 'next/navigation';
import { getFinanceWorkspace } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
    debtId: string;
  }>;
}

export default async function WorkspaceDebtDetailPage({ params }: Props) {
  const { wsId: id, debtId } = await params;
  const workspace = await getFinanceWorkspace(id);
  if (!workspace) notFound();

  return <DebtLoanDetailPage wsId={workspace.id} debtId={debtId} />;
}
