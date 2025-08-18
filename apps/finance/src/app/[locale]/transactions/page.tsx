import TransactionsPage from '@tuturuuu/ui/finance/transactions/transactions-page';

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

export default async function WorkspaceTransactionsPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  const sp = await searchParams;

  return <TransactionsPage wsId={wsId} searchParams={sp} />;
}
