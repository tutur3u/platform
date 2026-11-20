import { headers } from 'next/headers';
import { ModulesPageClient } from '@/components/modules/modules-page-client';
import { redirect } from '@/i18n/navigation';
import { getTeachRequestBootstrap } from '@/lib/teach-bootstrap';

export default async function WorkspaceModulesPage({
  params,
}: {
  params: Promise<{ locale: string; wsId: string }>;
}) {
  const { locale, wsId } = await params;
  const requestHeaders = await headers();

  const bootstrap = await getTeachRequestBootstrap(requestHeaders).catch(
    () => null
  );

  if (!bootstrap) {
    redirect({ href: `/login?next=/${wsId}/modules`, locale });
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

  return <ModulesPageClient wsId={wsId} workspaceName={workspace.name} />;
}
