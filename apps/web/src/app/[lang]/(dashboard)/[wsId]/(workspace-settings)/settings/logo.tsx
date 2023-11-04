'use client';

import useTranslation from 'next-translate/useTranslation';
import { Workspace } from '@/types/primitives/Workspace';
import LogoInput from './logo-input';

interface Props {
  workspace?: Workspace | null;
  allowEdit?: boolean;
}

export default function WorkspaceLogoSettings({ workspace, allowEdit }: Props) {
  const { t } = useTranslation('ws-settings');

  if (!workspace) return null;

  return (
    <div className="border-border bg-foreground/5 flex flex-col rounded-lg border p-4">
      <div className="mb-1 text-2xl font-bold">{t('workspace_logo')}</div>
      <div className="mb-4 font-semibold text-zinc-500">
        {t('workspace_logo_description')}
      </div>

      <LogoInput
        workspace={workspace}
        defaultValue={workspace.name}
        disabled={!workspace || !allowEdit}
      />
    </div>
  );
}
