import {
  getCurrentUserDefaultWorkspace,
  InternalApiError,
  listWorkspaces,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import {
  getPendingWorkspaceInvitations,
  SatelliteWorkspaceInvitationList,
} from '@tuturuuu/satellite/workspace-invitation';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { redirect } from '@/i18n/navigation';

/**
 * `/dashboard` is the app's entry point, not a page.
 *
 * It used to end at a static "Forms — build, share, and analyze" card with no
 * link, button or navigation on it: a signed-in user who landed here had no way
 * forward except editing the URL. It now resolves the workspace to open and
 * sends them there, matching what every other satellite does.
 *
 * Pending invitations still render inline, because those are a real decision to
 * make before picking a workspace.
 */
export default async function DashboardEntryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await connection();

  const { locale } = await params;
  const requestHeaders = await headers();
  const appSession = await getSatelliteAppSession('forms');

  if (!appSession) {
    redirect({ href: '/login?next=/dashboard', locale });
  }

  const invitations = await getPendingWorkspaceInvitations(requestHeaders);

  if (invitations.length > 0) {
    return (
      <SatelliteWorkspaceInvitationList
        afterDeclineHref="/dashboard"
        invitations={invitations}
      />
    );
  }

  try {
    const auth = withForwardedInternalApiAuth(requestHeaders);

    // Prefer the user's default (or personal) workspace; otherwise fall back to
    // the first workspace they belong to — never the root/admin workspace.
    const defaultWorkspace = await getCurrentUserDefaultWorkspace(auth);
    const workspace =
      defaultWorkspace ?? (await listWorkspaces(auth))?.[0] ?? null;

    if (!workspace) {
      // No accessible workspace yet. Bounce through the central login, which is
      // the only surface that can run onboarding — landing here with nothing to
      // open is exactly the dead end this page used to be.
      return redirect({ href: '/login?next=/dashboard&refresh=1', locale });
    }

    const workspaceSlug = toWorkspaceSlug(workspace.id, {
      personal: !!workspace.personal,
    });

    // `/[wsId]` itself redirects on to `/[wsId]/forms`, so this lands on the
    // form list rather than another intermediate screen.
    redirect({ href: `/${workspaceSlug}`, locale });
  } catch (error) {
    if (
      error instanceof InternalApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      redirect({ href: '/login?next=/dashboard&refresh=1', locale });
    }

    throw error;
  }
}
