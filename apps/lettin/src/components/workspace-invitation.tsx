'use client';

import { SatelliteWorkspaceInvitationCard } from '@tuturuuu/satellite/workspace-invitation';
import type { ComponentProps } from 'react';
import { usePathname } from '@/i18n/navigation';

export function WorkspaceInvitation({
  invitation,
}: Pick<
  ComponentProps<typeof SatelliteWorkspaceInvitationCard>,
  'invitation'
>) {
  const pathname = usePathname();
  const workspaceRoot = `/${invitation.workspace.id}`;
  const destination =
    pathname === workspaceRoot || pathname.startsWith(`${workspaceRoot}/`)
      ? pathname
      : workspaceRoot;
  return (
    <SatelliteWorkspaceInvitationCard
      invitation={invitation}
      afterDeclineHref="/dashboard"
      workspaceHref={destination}
    />
  );
}
