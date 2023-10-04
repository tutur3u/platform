'use client';

import useTranslation from 'next-translate/useTranslation';
import { Workspace } from '@/types/primitives/Workspace';
import LogoInput from './logo-input';

interface Props {
  workspace: Workspace;
  allowEdit?: boolean;
}

export default function WorkspaceLogoSettings({ workspace, allowEdit }: Props) {
  const { t } = useTranslation('ws-settings');

  return (
    <div className="flex flex-col rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
      <div className="mb-1 text-2xl font-bold">{t('workspace_logo')}</div>
      <div className="mb-4 font-semibold text-zinc-500">
        {t('workspace_logo_description')}
      </div>

      <LogoInput
        workspace={workspace}
        defaultValue={workspace.name}
        disabled={!allowEdit}
      />
    </div>
  );
}
