import type { Metadata } from 'next';
import { redirectToFinanceApp } from '../../redirect';

export const metadata: Metadata = {
  title: 'Finance Debt Details',
  description:
    'View debt and loan details in the Finance area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    debtId: string;
    wsId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspaceDebtDetailPage({
  params,
  searchParams,
}: Props) {
  const { debtId, wsId } = await params;

  return redirectToFinanceApp({
    params: Promise.resolve({ wsId }),
    path: `debts/${debtId}`,
    searchParams,
  });
}
