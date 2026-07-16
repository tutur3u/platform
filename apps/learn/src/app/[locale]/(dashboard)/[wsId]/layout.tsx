import {
  getTulearnBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import {
  getPendingWorkspaceInvitation,
  SatelliteWorkspaceInvitationCard,
} from '@tuturuuu/satellite/workspace-invitation';
import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { LearnerShell, NoWorkspaceState } from '@/components/learner-shell';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const requestHeaders = await headers();
  const bootstrap = await getTulearnBootstrap(
    withForwardedInternalApiAuth(requestHeaders)
  );

  if (!bootstrap.workspaces.length) {
    const invitation = await getPendingWorkspaceInvitation(
      wsId,
      requestHeaders
    );

    if (invitation) {
      return (
        <SatelliteWorkspaceInvitationCard
          afterDeclineHref="/dashboard"
          invitation={invitation}
          workspaceHref={`/${invitation.workspace.id}`}
        />
      );
    }

    return <NoWorkspaceState />;
  }

  if (!bootstrap.workspaces.some((workspace) => workspace.id === wsId)) {
    const invitation = await getPendingWorkspaceInvitation(
      wsId,
      requestHeaders
    );

    if (invitation) {
      return (
        <SatelliteWorkspaceInvitationCard
          afterDeclineHref="/dashboard"
          invitation={invitation}
          workspaceHref={`/${invitation.workspace.id}`}
        />
      );
    }
  }

  return (
    <LearnerShell bootstrap={bootstrap} wsId={wsId}>
      {children}
    </LearnerShell>
  );
}
