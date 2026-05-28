import { ChatWorkspace } from '@tuturuuu/ui/chat/chat-workspace';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { requireChatUser } from '@/lib/access';

export default async function ChatWorkspacePage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const user = await requireChatUser();
  const workspace = await getWorkspace(wsId, { useAdmin: true, user });

  if (!workspace?.joined) redirect('/');

  return (
    <ChatWorkspace
      currentUserId={user.id}
      variant="standalone"
      wsId={workspace.id}
    />
  );
}
