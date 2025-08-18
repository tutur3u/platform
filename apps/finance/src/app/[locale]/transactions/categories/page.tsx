import TransactionCategoriesPage from '@tuturuuu/ui/finance/transactions/categories/transactions-categories-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
  }>;
}

export default async function WorkspaceTransactionCategoriesPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  const sp = await searchParams;
  return (
    <TransactionCategoriesPage wsId={wsId} searchParams={sp} />
  );
}

