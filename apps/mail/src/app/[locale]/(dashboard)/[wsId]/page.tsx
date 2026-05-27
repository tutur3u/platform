import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { MailAppClient } from './mail-client';

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function MailPage({ params }: PageProps) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id, { useAdmin: true });

  if (!workspace?.joined) notFound();

  const wsId = workspace.id;
  const workspaceSlug = toWorkspaceSlug(wsId, {
    personal: !!workspace.personal,
  });

  return <MailAppClient workspaceId={workspaceSlug} />;
}
