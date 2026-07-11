import { DebtsPage } from '@tuturuuu/ui/finance/debts';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

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
  await connection();

  const { wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
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
