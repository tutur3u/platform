import { TagManager } from '@tuturuuu/ui/finance/tags/tag-manager';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTagsPage({ params }: Props) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  return <TagManager wsId={workspace.id} />;
}
