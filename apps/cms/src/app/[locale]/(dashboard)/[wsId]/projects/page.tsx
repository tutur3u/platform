import { redirect } from 'next/navigation';
import { RootExternalProjectsAdminClient } from '@/features/admin/root-admin-client';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';
import {
  listCanonicalExternalProjects,
  listExternalProjectWorkspaceBindingSummaries,
  listWorkspaceExternalProjectBindingAudits,
} from '@/lib/external-projects/admin-store';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CmsProjectsPage({ params }: Props) {
  const { wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (!access.canAccessAdmin) {
    redirect('/no-access');
  }

  const [projects, bindings, audits] = await Promise.all([
    listCanonicalExternalProjects(),
    listExternalProjectWorkspaceBindingSummaries(),
    listWorkspaceExternalProjectBindingAudits(),
  ]);

  return (
    <RootExternalProjectsAdminClient
      initialAudits={audits}
      initialBindings={bindings}
      initialProjects={projects}
    />
  );
}
