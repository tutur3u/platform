'use client';

import { SatelliteWorkspaceInvitationCard } from '@tuturuuu/satellite/workspace-invitation';
import { useLocale } from 'next-intl';
import type { ComponentProps } from 'react';
import { usePathname } from '@/i18n/navigation';

export function WorkspaceInvitation({
  invitation,
}: Pick<
  ComponentProps<typeof SatelliteWorkspaceInvitationCard>,
  'invitation'
>) {
  const pathname = usePathname();
  const locale = useLocale();
  const workspaceRoot = `/${invitation.workspace.id}`;
  const destination =
    pathname === workspaceRoot || pathname.startsWith(`${workspaceRoot}/`)
      ? pathname
      : workspaceRoot;
  return (
    <SatelliteWorkspaceInvitationCard
      invitation={invitation}
      afterDeclineHref={`/${locale}/dashboard`}
      workspaceHref={`/${locale}${destination}`}
    />
  );
}
