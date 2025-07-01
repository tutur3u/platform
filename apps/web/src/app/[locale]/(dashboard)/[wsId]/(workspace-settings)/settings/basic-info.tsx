'use client';

import type { Workspace } from '@tuturuuu/types/db';
import { useTranslations } from 'next-intl';
import WorkspaceIDCopy from './id-copy';
import NameInput from './name-input';

interface Props {
  workspace?: Workspace | null;
  allowEdit?: boolean;
}

export default function BasicInfo({ workspace, allowEdit }: Props) {
  const t = useTranslations('ws-settings');

  if (!workspace) return null;

  return (
    <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
      <div className="mb-1 text-2xl font-bold">{t('basic_info')}</div>
      <div className="mb-4 font-semibold text-foreground/80">
        {t('basic_info_description')}
      </div>

      <div className="grid gap-4">
        <NameInput
          wsId={workspace.id}
          defaultValue={workspace.name}
          disabled={!workspace || !allowEdit}
        />

        <WorkspaceIDCopy wsId={workspace.id} />
      </div>
    </div>
  );
}
