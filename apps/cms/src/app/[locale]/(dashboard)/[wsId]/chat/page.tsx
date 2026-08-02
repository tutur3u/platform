import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';
import { ConnectedChatSettings } from './settings';

export default async function ConnectedChatPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);
  if (!access.canAccessWorkspace) redirect('/no-access');
  if (
    !access.workspacePermissions?.containsPermission('manage_external_projects')
  ) {
    redirect('/no-access');
  }
  if (!access.binding?.canonical_project?.allowed_features.includes('chat'))
    redirect(`/${wsId}`);
  return <ConnectedChatSettings wsId={access.normalizedWorkspaceId} />;
}
