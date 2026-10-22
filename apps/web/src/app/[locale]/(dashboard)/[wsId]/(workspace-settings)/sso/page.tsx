import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { SsoManagement } from './sso-management';

export async function generateMetadata() {
  const t = await getTranslations('workspace-sso');
  return { title: t('title') };
}
export default async function WorkspaceSsoPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  return (
    <WorkspaceWrapper params={params}>
      {async ({ workspace, wsId }) => {
        const permissions = await getPermissions({ wsId });
        if (
          workspace.personal ||
          workspace.deleted ||
          permissions?.membershipType !== 'MEMBER' ||
          permissions.withoutPermission('manage_sso_clients')
        )
          notFound();
        return <SsoManagement key={wsId} wsId={wsId} />;
      }}
    </WorkspaceWrapper>
  );
}
