import TransactionsPage from '@tuturuuu/ui/finance/transactions/transactions-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTransactionsPage({
  params
}: Props) {
  const { wsId } = await params;

  return <TransactionsPage wsId={wsId} />;
}
