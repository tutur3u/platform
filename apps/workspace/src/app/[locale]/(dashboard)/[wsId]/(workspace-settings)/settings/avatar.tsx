'use client';

import type { User, UserPrivateDetails, Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { useTranslations } from 'next-intl';
import AvatarInput from './avatar-input';

interface Props {
  user?: (User & UserPrivateDetails) | WorkspaceUser | null;
  workspace?: Workspace | null;
  allowEdit?: boolean;
}

export default function WorkspaceAvatarSettings({
  user,
  workspace,
  allowEdit,
}: Props) {
  const t = useTranslations('ws-settings');
  const tAccount = useTranslations('settings-account');

  if (!workspace) return null;

  return (
    <SettingItemTab
      className="self-start"
      controlWidth="xl"
      description={
        allowEdit
          ? t('workspace_avatar_description')
          : `${t('workspace_avatar_description')}\n${tAccount('insufficient_permissions_avatar')}`
      }
      title={t('workspace_avatar')}
    >
      <AvatarInput
        workspace={
          workspace.personal
            ? { ...workspace, avatar_url: user?.avatar_url ?? null }
            : workspace
        }
        defaultValue={workspace.name}
        disabled={!allowEdit}
      />
    </SettingItemTab>
  );
}
