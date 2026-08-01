import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { ConnectedHome } from './connected-home';

async function UserGroupQuickActionsSlot({ wsId }: { wsId: string }) {
  const { default: UserGroupQuickActions } = await import(
    './user-groups/quick-actions'
  );

  return <UserGroupQuickActions wsId={wsId} />;
}

async function PermissionSetupBannerSlot({
  isCreator,
  wsId,
}: {
  isCreator: boolean;
  wsId: string;
}) {
  if (!isCreator) return null;

  const { default: PermissionSetupBanner } = await import(
    './permission-setup-banner'
  );

  return <PermissionSetupBanner wsId={wsId} isCreator />;
}

async function ensureDashboardAccess({
  user,
  wsId,
}: {
  user: {
    email?: string | null;
    id: string;
  };
  wsId: string;
}) {
  const { getPermissions } = await import('@tuturuuu/utils/workspace-helper');
  const permissions = await getPermissions({ user, wsId });
  if (!permissions) notFound();
}

async function resolveDashboardWorkspace(routeWsId: string) {
  const [{ getCurrentUser }, { getWorkspace }] = await Promise.all([
    import('@tuturuuu/utils/user-helper'),
    import('@tuturuuu/utils/workspace-helper'),
  ]);

  const currentUser = await getCurrentUser();
  if (!currentUser) notFound();

  const workspace = await getWorkspace(routeWsId, {
    useAdmin: true,
    user: {
      email: currentUser.email ?? null,
      id: currentUser.id,
    },
  });
  if (!workspace) notFound();

  return { currentUser, workspace };
}

export const metadata: Metadata = {
  title: 'Home',
  description: 'Your adaptive Tuturuuu workspace home.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceHomePage({ params }: Props) {
  await connection();

  const { wsId: routeWsId } = await params;
  const { currentUser, workspace } = await resolveDashboardWorkspace(routeWsId);

  const wsId = workspace.id;
  const isCreator = workspace.creator_id === currentUser.id;
  await ensureDashboardAccess({
    user: {
      email: currentUser.email ?? null,
      id: currentUser.id,
    },
    wsId,
  });

  return (
    <>
      {!workspace.personal && (
        <Suspense fallback={null}>
          <PermissionSetupBannerSlot wsId={wsId} isCreator={isCreator} />
        </Suspense>
      )}

      {!workspace.personal && (
        <Suspense fallback={null}>
          <UserGroupQuickActionsSlot wsId={wsId} />
        </Suspense>
      )}

      <ConnectedHome
        canTest={isExactTuturuuuDotComEmail(currentUser.email)}
        userName={
          currentUser.display_name ||
          currentUser.full_name ||
          currentUser.email?.split('@')[0] ||
          null
        }
        workspace={workspace}
      />
    </>
  );
}
