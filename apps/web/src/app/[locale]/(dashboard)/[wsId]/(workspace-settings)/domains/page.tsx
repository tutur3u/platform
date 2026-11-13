import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { DomainsManagement } from './domains-management';

export async function generateMetadata() {
  const t = await getTranslations('workspace-domains');
  return { title: t('title') };
}

export default async function WorkspaceDomainsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  return (
    <WorkspaceWrapper params={params}>
      {async ({ workspace, wsId }) => {
        const permissions = await getPermissions({ wsId });
        const canManage =
          permissions?.containsPermission('manage_workspace_domains') ?? false;
        const canView =
          canManage ||
          (permissions?.containsPermission('view_workspace_domains') ?? false);
        if (workspace.deleted || !canView) notFound();
        return <DomainsManagement key={wsId} wsId={wsId} />;
      }}
    </WorkspaceWrapper>
  );
}
