import {
  getTulearnBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { ModuleDetailClient } from './client';
import { redirect } from '@/i18n/navigation';

export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ locale: string; moduleId: string; wsId: string }>;
}) {
  const { locale, moduleId, wsId } = await params;
  const requestHeaders = await headers();
  const authOptions = withForwardedInternalApiAuth(requestHeaders);

  const bootstrap = await getTulearnBootstrap(authOptions).catch(() => null);

  if (!bootstrap) {
    redirect({ href: `/login?next=/${wsId}/modules/${moduleId}`, locale });
    throw new Error('Redirecting to Teach login');
  }

  const workspace = bootstrap.workspaces.find((w) => w.id === wsId);

  if (!workspace) {
    const fallbackId = bootstrap.workspaces[0]?.id;
    redirect({
      href: fallbackId ? `/${fallbackId}/modules` : '/dashboard',
      locale,
    });
    throw new Error('Workspace not found');
  }

  return (
    <ModuleDetailClient
      courseId={moduleId}
      wsId={wsId}
      workspaceName={workspace.name}
    />
  );
}
