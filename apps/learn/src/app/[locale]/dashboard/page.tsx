import {
  getConfiguredLearnApiBaseUrl,
  getTulearnBootstrap,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import {
  getPendingWorkspaceInvitations,
  SatelliteWorkspaceInvitationList,
} from '@tuturuuu/satellite/workspace-invitation';
import { headers } from 'next/headers';
import { NoWorkspaceState } from '@/components/learner-shell';
import { redirect } from '@/i18n/navigation';

export const instant = false;

export default async function DashboardEntryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const requestHeaders = await headers();
  const appSession = await getSatelliteAppSession('learn');

  if (!appSession) {
    redirect({ href: '/login?next=/dashboard', locale });
  }

  let bootstrap: Awaited<ReturnType<typeof getTulearnBootstrap>>;
  try {
    bootstrap = await getTulearnBootstrap(
      withForwardedInternalApiAuth(requestHeaders, {
        baseUrl: getConfiguredLearnApiBaseUrl(),
      })
    );
  } catch (error) {
    if (
      error instanceof InternalApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      redirect({ href: '/login?next=/dashboard&refresh=1', locale });
    }

    throw error;
  }

  const workspaceId = bootstrap?.workspaces[0]?.id;
  if (!workspaceId) {
    const invitations = await getPendingWorkspaceInvitations(requestHeaders);

    if (invitations.length > 0) {
      return (
        <SatelliteWorkspaceInvitationList
          afterDeclineHref="/dashboard"
          invitations={invitations}
        />
      );
    }

    return <NoWorkspaceState />;
  }

  redirect({ href: `/${workspaceId}`, locale });
}
