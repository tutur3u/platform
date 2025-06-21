import WorkspaceAvatarSettings from './avatar';
import BasicInfo from './basic-info';
import WorkspaceLogoSettings from './logo';
import Security from './security';
import { FeatureCard } from '@/components/feature-card';
import { RequestFeatureAccessDialog } from '@/components/request-feature-access-dialog';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Plus, UserPlus } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getFeatureFlags } from '@tuturuuu/utils/feature-flags/core';
import {
  getRequestableFeature,
  getRequestableFeatureKeys,
} from '@tuturuuu/utils/feature-flags/requestable-features';
import {
  getPermissions,
  getSecrets,
  getWorkspace,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceSettingsPage({ params }: Props) {
  const { wsId } = await params;

  const { containsPermission } = await getPermissions({
    wsId,
  });

  const t = await getTranslations();
  const ws = await getWorkspace(wsId);
  const secrets = await getSecrets({ wsId });
  const disableInvite = await verifyHasSecrets(wsId, ['DISABLE_INVITE']);

  // Get feature flags for the dialog
  const featureFlags = await getFeatureFlags(wsId, true);

  // Debug logging
  console.log('Server - Feature flags for wsId:', wsId, featureFlags);

  const approvedFeatures = getRequestableFeatureKeys().filter(
    (key) => featureFlags[getRequestableFeature(key).flag]
  );
  console.log('approvedFeatures', approvedFeatures);

  const preventWorkspaceDeletion =
    secrets
      .find((s) => s.name === 'PREVENT_WORKSPACE_DELETION')
      ?.value?.toLowerCase() === 'true';

  const enableAvatar = Boolean(
    secrets.find((s) => s.name === 'ENABLE_AVATAR')?.value
  );

  const enableLogo = Boolean(
    secrets.find((s) => s.name === 'ENABLE_LOGO')?.value
  );

  const isRootWorkspace = ws?.id === ROOT_WORKSPACE_ID;
  const isWorkspaceOwner = ws?.role === 'OWNER';

  const enableSecurity =
    !isRootWorkspace && isWorkspaceOwner && !preventWorkspaceDeletion;

  return (
    <>
      <FeatureSummary
        pluralTitle={t('common.settings')}
        description={t('ws-settings.description')}
        action={
          containsPermission('manage_workspace_members') ? (
            <Link href={`/${wsId}/members`}>
              <Button className="cursor-pointer">
                <UserPlus className="mr-2 h-4 w-4" />
                <span>
                  {disableInvite
                    ? t('ws-members.invite_member_disabled')
                    : t('ws-members.invite_member')}
                </span>
              </Button>
            </Link>
          ) : undefined
        }
      />
      <Separator className="my-4" />

      <div className="grid gap-4 lg:grid-cols-2">
        <BasicInfo
          workspace={ws}
          allowEdit={!isRootWorkspace && ws?.role !== 'MEMBER'}
        />

        {enableAvatar && (
          <WorkspaceAvatarSettings
            workspace={ws}
            allowEdit={ws?.role === 'OWNER'}
          />
        )}

        {enableLogo && (
          <WorkspaceLogoSettings
            workspace={ws}
            allowEdit={ws?.role === 'OWNER'}
          />
        )}

        {enableSecurity && <Security workspace={ws} />}
      </div>
      {isWorkspaceOwner ? (
        <div className="flex flex-col gap-4">
          <Separator />
          <FeatureSummary
            pluralTitle={t('ws-settings.features')}
            description={t('ws-settings.features_description')}
            action={
              <RequestFeatureAccessDialog
                wsId={wsId}
                workspaceName={ws?.name}
                enabledFeatures={featureFlags}
              >
                <Button variant="default" size="default">
                  <Plus className="mr-2 h-4 w-4" />
                  Request Features
                </Button>
              </RequestFeatureAccessDialog>
            }
          />
          <div className="grid gap-2 text-center md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {approvedFeatures.map((key) => {
              const feature = getRequestableFeature(key);
              return (
                <FeatureCard
                  key={key}
                  icon={feature.icon}
                  name={feature.name}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <></>
      )}
    </>
  );
}
