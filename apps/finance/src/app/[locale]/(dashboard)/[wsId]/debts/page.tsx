import { DebtsPage } from '@tuturuuu/ui/finance/debts';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

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
  const sp = await searchParams;

  return <DebtsPage wsId={workspace.id} searchParams={sp} />;
}
