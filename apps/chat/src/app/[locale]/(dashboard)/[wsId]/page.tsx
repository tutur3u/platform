import { ChatWorkspace } from '@tuturuuu/ui/chat/chat-workspace';
import { requireChatUser } from '@/lib/access';

export default async function ChatWorkspacePage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const user = await requireChatUser();

  return (
    <ChatWorkspace currentUserId={user.id} variant="standalone" wsId={wsId} />
  );
}
