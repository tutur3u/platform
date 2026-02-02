import { DebtLoanDetailPage } from '@tuturuuu/ui/finance/debts';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  title: 'Debt/Loan Details',
  description: 'View and manage debt/loan details in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    debtId: string;
  }>;
}

export default async function WorkspaceDebtDetailPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, debtId }) => {
        return <DebtLoanDetailPage wsId={wsId} debtId={debtId} />;
      }}
    </WorkspaceWrapper>
  );
}
