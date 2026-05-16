import {
  getTeachBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { ModulesPageClient } from '@/components/modules/modules-page-client';
import { redirect } from '@/i18n/navigation';

export default async function WorkspaceCoursesPage({
  params,
}: {
  params: Promise<{ locale: string; wsId: string }>;
}) {
  const { locale, wsId } = await params;
  const requestHeaders = await headers();
  const authOptions = withForwardedInternalApiAuth(requestHeaders);
  const bootstrap = await getTeachBootstrap(authOptions).catch(() => null);

  if (!bootstrap) {
    redirect({ href: `/login?next=/${wsId}/courses`, locale });
    throw new Error('Redirecting to Teach login');
  }

  const workspace = bootstrap.workspaces.find((w) => w.id === wsId);

  if (!workspace) {
    const fallbackId = bootstrap.workspaces[0]?.id;
    redirect({
      href: fallbackId ? `/${fallbackId}/courses` : '/dashboard',
      locale,
    });
    throw new Error('Workspace not found');
  }

  return <ModulesPageClient wsId={wsId} workspaceName={workspace.name} />;
}
