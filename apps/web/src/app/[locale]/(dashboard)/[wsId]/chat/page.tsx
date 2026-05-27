import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { ChatWorkspace } from '@tuturuuu/ui/chat/chat-workspace';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export default async function RealtimeChatPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const supabase = await createClient();

        const { user } = await resolveAuthenticatedSessionUser(supabase);

        if (!user) redirect('/login');

        const permissions = await getPermissions({ user, wsId });
        if (!permissions) notFound();
        if (permissions.withoutPermission('view_chat')) redirect(`/${wsId}`);

        return <ChatWorkspace currentUserId={user.id} wsId={wsId} />;
      }}
    </WorkspaceWrapper>
  );
}
