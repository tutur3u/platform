import { DebtLoanDetailPage } from '@tuturuuu/ui/finance/debts';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
    debtId: string;
  }>;
}

export default async function WorkspaceDebtDetailPage({ params }: Props) {
  await connection();

  const { wsId: id, debtId } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) notFound();

  return <DebtLoanDetailPage wsId={context.wsId} debtId={debtId} />;
}
