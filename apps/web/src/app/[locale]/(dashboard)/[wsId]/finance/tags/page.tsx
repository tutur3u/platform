import { TagManager } from '@tuturuuu/ui/finance/tags/tag-manager';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Tags',
  description: 'Manage Tags in the Finance area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTagsPage({ params }: Props) {
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
if (!workspace) notFound();
  const wsId = workspace.id;

  return <TagManager wsId={wsId} />;
}
