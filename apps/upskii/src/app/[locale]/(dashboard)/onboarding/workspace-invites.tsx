import { getUserDefaultWorkspace } from '@tuturuuu/utils/user-helper';
import {
  getWorkspaceInvites,
  getWorkspaces,
} from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceInviteSnippet from '@/components/notifications/WorkspaceInviteSnippet';

export default async function WorkspaceInvites() {
  const t = await getTranslations('onboarding');

  const workspaces = await getWorkspaces();
  const workspaceInvites = await getWorkspaceInvites();

  // Check if user has workspaces and redirect to the default one
  if (workspaces?.length) {
    const defaultWorkspace = await getUserDefaultWorkspace();
    if (defaultWorkspace?.id) {
      redirect(`/${defaultWorkspace.id}/home`);
    }
  }

  return (
    <div className="scrollbar-none grid h-full w-full gap-4 overflow-y-auto">
      {workspaceInvites.length ? (
        workspaceInvites.map((ws) => (
          <WorkspaceInviteSnippet key={ws.id} ws={ws} />
        ))
      ) : (
        <div className="flex h-full items-center justify-center px-4 py-16 text-center text-lg font-semibold text-foreground/60 md:text-2xl">
          {t('no-invites')}
        </div>
      )}
    </div>
  );
}
