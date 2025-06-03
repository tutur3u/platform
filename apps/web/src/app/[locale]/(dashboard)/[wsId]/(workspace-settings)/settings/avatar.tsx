'use client';

import AvatarInput from './avatar-input';
import { Workspace } from '@ncthub/types/db';
import { useTranslations } from 'next-intl';

interface Props {
  workspace?: Workspace | null;
  allowEdit?: boolean;
}

export default function WorkspaceAvatarSettings({
  workspace,
  allowEdit,
}: Props) {
  const t = useTranslations('ws-settings');

  if (!workspace) return null;

  return (
    <div className="border-border bg-foreground/5 flex flex-col rounded-lg border p-4">
      <div className="mb-1 text-2xl font-bold">{t('workspace_avatar')}</div>
      <div className="text-foreground/80 mb-4 font-semibold">
        {t('workspace_avatar_description')}
      </div>

      <AvatarInput
        workspace={workspace}
        defaultValue={workspace.name}
        disabled={!workspace || !allowEdit}
      />
    </div>
  );
}
