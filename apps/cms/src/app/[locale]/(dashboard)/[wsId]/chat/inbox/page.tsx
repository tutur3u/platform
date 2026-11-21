import { ChatWorkspace } from '@tuturuuu/ui/chat/chat-workspace';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

export default async function ConnectedChatInboxPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (!access.canAccessConnectedChat || !access.userId) redirect('/no-access');
  if (
    !access.workspacePermissions ||
    access.workspacePermissions.withoutPermission('view_chat')
  ) {
    redirect('/no-access');
  }
  if (!access.binding?.canonical_project?.allowed_features.includes('chat')) {
    redirect(`/${wsId}`);
  }
  const readOnly = access.workspacePermissions.withoutPermission('create_chat');

  return (
    <div className="-m-2 h-[calc(100dvh-var(--mobile-nav-height,calc(3.5rem+env(safe-area-inset-top,0px)))-0.75rem-var(--mobile-dock-clearance,0px))] md:-m-4 md:h-dvh">
      <ChatWorkspace
        currentUserId={access.userId}
        defaultConversationScope="external"
        enforcedConversationScope="external"
        readOnly={readOnly}
        variant="standalone"
        wsId={access.normalizedWorkspaceId}
      />
    </div>
  );
}
