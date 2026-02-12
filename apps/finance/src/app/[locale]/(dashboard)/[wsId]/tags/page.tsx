import { TagManager } from '@tuturuuu/ui/finance/tags/tag-manager';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTagsPage({ params }: Props) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);

  return <TagManager wsId={workspace.id} />;
}
