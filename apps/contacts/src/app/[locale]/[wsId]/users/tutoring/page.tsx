import { ENABLE_TUTORING_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import {
  isWorkspaceFeatureEnabled,
  resolveWorkspaceFeatureAccess,
} from '@/components/feature-gate/workspace-feature-access';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import {
  getContactsWorkspaceConfigValue,
  getContactsWorkspacePermissions,
} from '@/lib/workspace';
import { TutoringClient } from './tutoring-client';
import {
  TutoringDisabledGate,
  TutoringForbiddenGate,
  TutoringUnavailableGate,
} from './tutoring-gate';

export const metadata: Metadata = {
  title: 'Tutoring',
  description: 'Manage tutoring and remedial sessions.',
};

interface PageProps {
  params: Promise<{ locale: string; wsId: string }>;
}

export default async function TutoringPage({ params }: PageProps) {
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, isPersonal }) => {
        const permissions = await getContactsWorkspacePermissions(wsId);
        const configValue = permissions
          ? await getContactsWorkspaceConfigValue(
              wsId,
              ENABLE_TUTORING_CONFIG_ID
            )
          : null;

        const access = resolveWorkspaceFeatureAccess({
          canEnableFeature: Boolean(
            permissions?.containsPermission('manage_workspace_settings')
          ),
          canManageFeature: Boolean(
            permissions?.containsPermission('update_user_groups_scores')
          ),
          canView: Boolean(permissions?.containsPermission('view_user_groups')),
          enabled: isWorkspaceFeatureEnabled({
            defaultEnabled: true,
            isPersonal,
            value: configValue,
          }),
          hasWorkspaceAccess: Boolean(permissions),
        });

        if (access.status === 'unavailable') {
          return <TutoringUnavailableGate />;
        }

        if (access.status === 'forbidden') {
          return <TutoringForbiddenGate />;
        }

        if (access.status === 'disabled') {
          return (
            <TutoringDisabledGate canEnable={access.canEnable} wsId={wsId} />
          );
        }

        return <TutoringClient wsId={wsId} canManage={access.canManage} />;
      }}
    </WorkspaceWrapper>
  );
}
