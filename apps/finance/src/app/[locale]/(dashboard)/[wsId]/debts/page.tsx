import { DebtsPage } from '@tuturuuu/ui/finance/debts';
import { notFound } from 'next/navigation';
import { getFinanceWorkspace } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    type?: string;
  }>;
}

export default async function WorkspaceDebtsPage({
  params,
  searchParams,
}: Props) {
  const { wsId: id } = await params;
  const workspace = await getFinanceWorkspace(id);
  if (!workspace) notFound();
  const sp = await searchParams;

  return <DebtsPage wsId={workspace.id} searchParams={sp} />;
}
