import {
  listCanonicalExternalProjects,
  listExternalProjectWorkspaceBindings,
  listWorkspaceExternalProjectBindingAudits,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { RootExternalProjectsAdminClient } from '@/features/admin/root-admin-client';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

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

  const requestHeaders = await headers();
  const internalApiOptions = withForwardedInternalApiAuth(requestHeaders);
  const [projects, bindings, audits] = await Promise.all([
    listCanonicalExternalProjects(internalApiOptions),
    listExternalProjectWorkspaceBindings(internalApiOptions),
    listWorkspaceExternalProjectBindingAudits(internalApiOptions),
  ]);

  return (
    <RootExternalProjectsAdminClient
      initialAudits={audits}
      initialBindings={bindings}
      initialProjects={projects}
    />
  );
}
