import BudgetsPage from '@tuturuuu/ui/finance/budgets/budgets-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function WorkspaceBudgetsPage({
  params,
  searchParams,
}: Props) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  const sp = await searchParams;

  return <BudgetsPage wsId={workspace.id} searchParams={sp} />;
}
