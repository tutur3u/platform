import { DebtLoanDetailPage } from '@tuturuuu/ui/finance/debts';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

interface Props {
  params: Promise<{
    wsId: string;
    debtId: string;
  }>;
}

export default async function WorkspaceDebtDetailPage({ params }: Props) {
  const { wsId: id, debtId } = await params;
  const workspace = await getWorkspace(id);

  return <DebtLoanDetailPage wsId={workspace.id} debtId={debtId} />;
}
