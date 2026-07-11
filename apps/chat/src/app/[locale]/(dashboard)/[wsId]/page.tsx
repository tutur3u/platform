import { ChatWorkspace } from '@tuturuuu/ui/chat/chat-workspace';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { requireChatUser } from '@/lib/access';
import { getDefaultChatConversationScope } from './chat-default-scope';

export default async function ChatWorkspacePage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();

  const { wsId } = await params;
  const user = await requireChatUser();
  const workspace = await getWorkspace(wsId, { useAdmin: true, user });

  if (!workspace?.joined) redirect('/');

  return (
    <div className="-m-2 h-[calc(100dvh-4.25rem)] md:-m-4 md:h-dvh">
      <ChatWorkspace
        currentUserId={user.id}
        defaultConversationScope={getDefaultChatConversationScope(workspace)}
        enableRootIntegrations
        showSidebar={false}
        variant="standalone"
        wsId={workspace.id}
      />
    </div>
  );
}
