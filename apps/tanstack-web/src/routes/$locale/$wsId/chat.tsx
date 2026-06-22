import { createFileRoute, notFound } from '@tanstack/react-router';
import { ChatWorkspace } from '@tuturuuu/ui/chat/chat-workspace';
import { requireCurrentUser } from '../../../lib/platform/auth-gate';
import { createPageHead } from '../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../lib/platform/workspace-permission';

type ChatLoaderData = {
  userId: string;
  workspace: ResolvedWorkspace;
};

export const Route = createFileRoute('/$locale/$wsId/chat')({
  component: ChatRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Chat with your Tuturuuu workspace.',
      locale,
      title: 'Chat',
    });
  },
  loader: async ({ params }): Promise<ChatLoaderData> => {
    // Auth gate FIRST, fail closed: legacy resolveAuthenticatedSessionUser() ->
    // redirect('/login'). The profile carries the user id ChatWorkspace needs.
    const user = await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/chat`,
    });

    // Legacy getPermissions() -> notFound() when missing/forbidden; the id-only
    // workspace resolution mirrors that fail-closed behavior.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy withoutPermission('view_chat') -> redirect(`/${wsId}`).
    await requireWorkspacePermission({
      wsId: workspace.workspaceId,
      permission: 'view_chat',
      locale: params.locale,
    });

    return { userId: user.id, workspace };
  },
});

function ChatRoutePage() {
  const data = Route.useLoaderData() as ChatLoaderData | undefined;

  if (!data) {
    throw notFound();
  }

  const { userId, workspace } = data;

  // ChatWorkspace is a shared @tuturuuu/ui client that self-loads its
  // conversations/messages via TanStack Query and reads its `chat` namespace
  // strings from the next-intl provider in the $locale layout; it only needs
  // `currentUserId` and `wsId`. The client data fetches hit an /api origin
  // tanstack-web does not serve yet (the known Phase-2 data-origin gap).
  return <ChatWorkspace currentUserId={userId} wsId={workspace.workspaceId} />;
}
