'use client';

import WorkspaceIDCopy from './id-copy';
import NameInput from './name-input';
import type { Workspace } from '@tuturuuu/types/db';
import { useTranslations } from 'next-intl';

interface Props {
  workspace?: Workspace | null;
  allowEdit?: boolean;
  isPersonal?: boolean;
}

export default function BasicInfo({ workspace, allowEdit, isPersonal }: Props) {
  const t = useTranslations('ws-settings');

  if (!workspace) return null;

  return (
    <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
      <div className="mb-1 font-bold text-2xl">{t('basic_info')}</div>
      <div className="mb-4 font-semibold text-foreground/80">
        {t('basic_info_description')}
      </div>

      <div className="grid gap-4">
        {isPersonal || (
          <NameInput
            wsId={workspace.id}
            defaultValue={workspace.name}
            disabled={!workspace || !allowEdit}
          />
        )}
        <WorkspaceIDCopy wsId={workspace.id} />
      </div>
    </div>
  );
}
