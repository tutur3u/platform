import '@tanstack/react-start/server-only';
import { notFound, redirect } from '@tanstack/react-router';
import {
  getSatelliteAppSessionUser,
  getSatelliteCurrentUser,
} from '@tuturuuu/satellite/auth';
import { getPendingWorkspaceInvitation } from '@tuturuuu/satellite/workspace-invitation';
import {
  getSidebarBehaviorUpdatedAt,
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from '@tuturuuu/satellite/workspace-layout-helpers';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { resolveNotificationWebAppUrl } from './notification-url.server';
import { cookies, headers } from './request-context';

export async function loadMailWorkspace(id: string) {
  const user = await getSatelliteAppSessionUser('mail');
  if (!user?.id) throw redirect({ href: '/login' });
  const workspace = await getWorkspace(id, { useAdmin: true, user });
  if (!workspace?.personal && !isExactTuturuuuDotComEmail(user.email))
    throw redirect({ href: '/not-available' });
  if (!workspace?.joined) {
    const invitation = await getPendingWorkspaceInvitation(id, await headers());
    if (invitation) return { kind: 'invitation' as const, invitation };
  }
  if (!workspace) throw notFound();
  if (!workspace.joined) throw redirect({ href: '/' });
  const store = await cookies();
  const behavior = parseSidebarBehavior(store);
  return {
    kind: 'workspace' as const,
    workspace,
    wsId: workspace.id,
    workspaceSlug: toWorkspaceSlug(workspace.id, {
      personal: !!workspace.personal,
    }),
    actorId: user.id,
    notificationWebAppUrl: resolveNotificationWebAppUrl(),
    connectedByDefault: !isExactTuturuuuDotComEmail(user.email),
    profile: await getSatelliteCurrentUser('mail'),
    behavior,
    behaviorUpdatedAt: getSidebarBehaviorUpdatedAt(store),
    defaultCollapsed: getSidebarCollapsedState(store, behavior),
  };
}
