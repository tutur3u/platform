import { TagManager } from '@tuturuuu/ui/finance/tags/tag-manager';
import { notFound } from 'next/navigation';
import { getFinanceWorkspace } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTagsPage({ params }: Props) {
  const { wsId: id } = await params;
  const workspace = await getFinanceWorkspace(id);
  if (!workspace) notFound();

  return <TagManager wsId={workspace.id} />;
}
