import BudgetsPage from '@tuturuuu/ui/finance/budgets/budgets-page';
import { notFound } from 'next/navigation';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    create?: string;
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function WorkspaceBudgetsPage({
  params,
  searchParams,
}: Props) {
  const { wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) notFound();
  const sp = await searchParams;

  return (
    <BudgetsPage
      wsId={context.wsId}
      currency={context.currency}
      searchParams={sp}
    />
  );
}
