import TransactionCategoriesPage from '@tuturuuu/ui/finance/transactions/categories/transactions-categories-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTransactionCategoriesPage({
  params,
}: Props) {
  const { wsId } = await params;
  return <TransactionCategoriesPage wsId={wsId} />;
}
