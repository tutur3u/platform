import {
  listWorkspaces,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  getPendingWorkspaceInvitation,
  SatelliteWorkspaceInvitationCard,
} from '@tuturuuu/satellite/workspace-invitation';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { WorkspacePicker } from '@/components/workspace-picker';
import { WEB_APP_URL } from '@/constants/common';
import { Link } from '@/i18n/navigation';
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
        <>
          <Brand />
          <SatelliteWorkspaceInvitationCard
            invitation={invitation}
            afterDeclineHref="/dashboard"
            workspaceHref={`/${invitation.workspace.id}`}
          />
        </>
      );
    redirect('/dashboard');
  }
  const workspaces = await listWorkspaces(
    withForwardedInternalApiAuth(await headers())
  );
  const t = await getTranslations('lettin');
  return (
    <>
      <Brand />
      <div className="flex flex-wrap items-center gap-4 border-border border-b px-6 py-3 text-sm">
        <WorkspacePicker current={workspace.id} workspaces={workspaces} />
        {(await getNavigationLinks(workspace.id)).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-2"
          >
            {link.icon}
            {link.title}
          </Link>
        ))}
        <a href={`${WEB_APP_URL}/${workspace.id}/settings/members`}>
          {t('workspaceSettings')}
        </a>
        <a className="ml-auto" href="/api/auth/logout">
          {t('signOut')}
        </a>
      </div>
      {children}
    </>
  );
}
