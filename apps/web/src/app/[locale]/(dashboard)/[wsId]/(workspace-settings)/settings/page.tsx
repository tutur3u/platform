import WorkspaceAvatarSettings from './avatar';
import BasicInfo from './basic-info';
import FeatureToggles from './feature-toggles';
import WorkspaceLogoSettings from './logo';
import Security from './security';
import { DEV_MODE, ROOT_WORKSPACE_ID } from '@/constants/common';
import {
  getPermissions,
  getSecrets,
  getWorkspace,
  verifyHasSecrets,
} from '@/lib/workspace-helper';
import { Button } from '@tutur3u/ui/components/ui/button';
import FeatureSummary from '@tutur3u/ui/components/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { UserPlus } from 'lucide-react';
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

        {DEV_MODE && (
          <>
            <Separator className="col-span-full" />

            <div className="col-span-full flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
              <div className="mb-1 text-2xl font-bold">
                {t('ws-settings.features')}
              </div>
              <div className="mb-4 font-semibold text-foreground/80">
                {t('ws-settings.features_description')}
              </div>

              <div className="grid h-full items-end gap-2 text-center md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <FeatureToggles />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
