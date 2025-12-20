import { UserPlus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import {
  getPermissions,
  getSecrets,
  getWorkspace,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import AdminTaskEmbeddings from './admin-task-embeddings';
import WorkspaceAvatarSettings from './avatar';
import BasicInfo from './basic-info';
import WorkspaceLogoSettings from './logo';
import RemoveYourself from './remove-yourself';
import Security from './security';

export const metadata: Metadata = {
  title: 'Settings',
  description:
    'Manage Settings in the Workspace Settings area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceSettingsPage({ params }: Props) {
  const t = await getTranslations();
  const { wsId: id } = await params;

  const user = await getCurrentUser();
  const ws = await getWorkspace(id);
  const wsId = ws?.id;

  const { containsPermission } = await getPermissions({
    wsId,
  });

  const secrets = await getSecrets({ wsId });
  const disableInvite = await verifyHasSecrets(wsId, ['DISABLE_INVITE']);

  const preventWorkspaceDeletion =
    secrets
      .find((s) => s.name === 'PREVENT_WORKSPACE_DELETION')
      ?.value?.toLowerCase() === 'true';

  const enableLogo = Boolean(
    secrets.find((s) => s.name === 'ENABLE_LOGO')?.value
  );

  const isRootWorkspace = ws?.id === ROOT_WORKSPACE_ID;
  const canManageWorkspace = containsPermission('manage_workspace_settings');

  const enableSecurity =
    !isRootWorkspace &&
    !preventWorkspaceDeletion &&
    containsPermission('manage_workspace_security');

  return (
    <>
      <FeatureSummary
        pluralTitle={t('common.settings')}
        description={t('ws-settings.description')}
        action={
          id !== 'personal' &&
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
          workspace={{
            ...ws,
            name: id === 'personal' ? 'Personal Workspace' : ws?.name,
          }}
          allowEdit={
            id !== 'personal' && !isRootWorkspace && canManageWorkspace
          }
          isPersonal={id === 'personal'}
        />

        <WorkspaceAvatarSettings
          user={user}
          workspace={ws}
          allowEdit={id !== 'personal' && canManageWorkspace}
        />

        {enableLogo && (
          <WorkspaceLogoSettings
            workspace={ws}
            allowEdit={canManageWorkspace}
          />
        )}

        {id !== 'personal' && enableSecurity && <Security workspace={ws} />}
        {id !== 'personal' && <RemoveYourself workspace={ws} />}
        {isRootWorkspace && <AdminTaskEmbeddings />}
      </div>
    </>
  );
}
