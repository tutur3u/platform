'use client';

import type { User, UserPrivateDetails, Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
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

  if (!workspace) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="font-semibold text-lg">{t('workspace_avatar')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('workspace_avatar_description')}
        </p>
      </div>

      <AvatarInput
        workspace={
          workspace.personal
            ? { ...workspace, avatar_url: user?.avatar_url ?? null }
            : workspace
        }
        defaultValue={workspace.name}
        disabled={!workspace || !allowEdit}
      />
    </div>
  );
}
