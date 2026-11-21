import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
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
  parseSidebarExpandedWidth,
} from '@tuturuuu/satellite/workspace-layout-helpers';
import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import {
  appBasePath,
  withAppBase,
} from '@tuturuuu/start-bridge/start/base-path';
import {
  signedInLoaderTiming,
  type SignedInLoaderTiming,
} from '@tuturuuu/utils/signed-in-loader-timing';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { resolveNotificationWebAppUrl } from './notification-url.server';
import { cookies, headers, mailRequest } from './request-context';

export async function loadMailWorkspace(
  id: string,
  timing: SignedInLoaderTiming = signedInLoaderTiming()
) {
  const user = await timing.measure('workspace-actor', () =>
    getSatelliteAppSessionUser('mail')
  );
  if (!user?.id) {
    const appBase = appBasePath();
    if (!appBase) throw redirect({ href: '/login' });
    const origin = new URL(mailRequest().request.url);
    const path = createBasePath({ app: 'mail', basePath: appBase }).strip(
      origin.pathname
    );
    const login = new URL(withAppBase('/login'), origin);
    if (path) login.searchParams.set('next', path + origin.search);
    throw redirect({ href: login.pathname + login.search });
  }
  const isStaff = isVerifiedTuturuuuStaffSession(
    user &&
      (await timing.measure('staff', async () =>
        getVerifiedAuthUser(
          await createAdminClient({ noCookie: true }),
          user.id
        )
      ))
  );
  const workspace = await timing.measure('workspace', () =>
    getWorkspace(id, { useAdmin: true, user })
  );
  if (!workspace?.personal && !isStaff)
    throw redirect({ href: withAppBase('/not-available') });
  if (!workspace?.joined) {
    const invitation = await timing.measure('invitation', async () =>
      getPendingWorkspaceInvitation(id, await headers())
    );
    if (invitation) return { kind: 'invitation' as const, invitation };
  }
  if (!workspace) throw notFound();
  if (!workspace.joined) throw redirect({ href: withAppBase('/') });
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
    canConnectAccounts: isStaff && Boolean(workspace.personal),
    connectedByDefault: !isStaff,
    profile: await timing.measure('profile', () =>
      getSatelliteCurrentUser('mail')
    ),
    behavior,
    behaviorUpdatedAt: getSidebarBehaviorUpdatedAt(store),
    defaultCollapsed: getSidebarCollapsedState(store, behavior),
    sidebarExpandedWidth: parseSidebarExpandedWidth(
      (await headers()).get('cookie'),
      '15rem'
    ),
  };
}
