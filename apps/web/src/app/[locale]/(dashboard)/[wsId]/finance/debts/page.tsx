import { DebtsPage } from '@tuturuuu/ui/finance/debts';
import { notFound } from 'next/navigation';
import { getWebFinanceWorkspaceContext } from '@/lib/finance-workspace-context';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    create?: string;
    type?: string;
  }>;
}

export default async function WorkspaceDebtsPage({
  params,
  searchParams,
}: Props) {
  const { wsId: id } = await params;
  const context = await getWebFinanceWorkspaceContext(id);
  if (!context) notFound();
  const sp = await searchParams;

  return (
    <DebtsPage
      wsId={context.wsId}
      searchParams={sp}
      currency={context.currency}
    />
  );
}
