import {
  getTeachBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { TeachWorkspaceShell } from '@/components/teach-workspace-shell';
import { redirect } from '@/i18n/navigation';

export default async function TeachWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string; wsId: string }>;
}) {
  const { locale, wsId } = await params;
  const requestHeaders = await headers();
  const bootstrap = await getTeachBootstrap(
    withForwardedInternalApiAuth(requestHeaders)
  ).catch(() => null);

  if (!bootstrap) {
    return redirect({ href: `/login?next=/${wsId}`, locale });
  }

  const workspace = bootstrap.workspaces.find(
    (candidate) => candidate.id === wsId
  );

  if (!workspace) {
    const fallbackId = bootstrap.workspaces[0]?.id;
    return redirect({
      href: fallbackId ? `/${fallbackId}` : '/dashboard',
      locale,
    });
  }

  return (
    <TeachWorkspaceShell
      bootstrap={bootstrap}
      workspace={workspace}
      wsId={wsId}
    >
      {children}
    </TeachWorkspaceShell>
  );
}
