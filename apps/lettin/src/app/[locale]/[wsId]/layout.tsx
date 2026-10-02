import {
  listWorkspaces,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { getPendingWorkspaceInvitation } from '@tuturuuu/satellite/workspace-invitation';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { WorkspaceInvitation } from '@/components/workspace-invitation';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { WorkspacePicker } from '@/components/workspace-picker';
import { WEB_APP_URL } from '@/constants/common';
import { getNavigationLinks } from './navigation';
export const metadata = { robots: { index: false, follow: false } };
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  const user = await getSatelliteAppSessionUser('lettin');
  if (!user) redirect('/login');
  const workspace = await getWorkspace(wsId, { useAdmin: true, user });
  if (!workspace?.joined) {
    const invitation = await getPendingWorkspaceInvitation(
      wsId,
      await headers()
    );
    if (invitation)
      return (
        <div className="notebook-theme min-h-screen">
          <Brand />
          <WorkspaceInvitation invitation={invitation} />
        </div>
      );
    redirect('/dashboard');
  }
  const workspaces = await listWorkspaces(
    withForwardedInternalApiAuth(await headers())
  );
  const t = await getTranslations('lettin');
  return (
    <div className="notebook-theme min-h-screen">
      <Brand />
      <div className="lettin-workspace-bar flex flex-wrap items-center gap-4 px-6 py-3 text-sm">
        <WorkspacePicker current={workspace.id} workspaces={workspaces} />
        <WorkspaceNavigation links={await getNavigationLinks(workspace.id)} />
        <a href={`${WEB_APP_URL}/${workspace.id}/settings/members`}>
          {t('workspaceSettings')}
        </a>
        <a className="ml-auto" href="/api/auth/logout">
          {t('signOut')}
        </a>
      </div>
      {children}
    </div>
  );
}
