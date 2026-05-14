import TransactionCategoriesPage from '@tuturuuu/ui/finance/transactions/categories/transactions-categories-page';
import { notFound } from 'next/navigation';
import { getFinanceWorkspace } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTransactionCategoriesPage({
  params,
}: Props) {
  const { wsId: id } = await params;
  const workspace = await getFinanceWorkspace(id);
  if (!workspace) notFound();
  return <TransactionCategoriesPage wsId={workspace.id} />;
}
