import { DebtsPage } from '@tuturuuu/ui/finance/debts';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

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
  const workspace = await getWorkspace(id);
  if (!workspace) notFound();
  const sp = await searchParams;

  return <DebtsPage wsId={workspace.id} searchParams={sp} />;
}
