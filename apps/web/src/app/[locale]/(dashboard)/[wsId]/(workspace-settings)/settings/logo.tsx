'use client';

import LogoInput from './logo-input';
import { Workspace } from '@repo/types/primitives/Workspace';
import { useTranslations } from 'next-intl';

interface Props {
  workspace?: Workspace | null;
  allowEdit?: boolean;
}

export default function WorkspaceLogoSettings({ workspace, allowEdit }: Props) {
  const t = useTranslations('ws-settings');

  if (!workspace) return null;

  return (
    <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
      <div className="mb-1 text-2xl font-bold">{t('workspace_logo')}</div>
      <div className="mb-4 font-semibold text-foreground/80">
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
