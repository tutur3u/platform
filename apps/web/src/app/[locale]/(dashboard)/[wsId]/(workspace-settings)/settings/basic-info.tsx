'use client';

import type { Workspace } from '@tuturuuu/types';
import { useTranslations } from 'next-intl';
import WorkspaceIDCopy from './id-copy';
import NameInput from './name-input';

interface Props {
  workspace?: Workspace | null;
  allowEdit?: boolean;
  isPersonal?: boolean;
}

export default function BasicInfo({ workspace, allowEdit, isPersonal }: Props) {
  const t = useTranslations('ws-settings');

  if (!workspace) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="font-semibold text-lg">{t('basic_info')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('basic_info_description')}
        </p>
      </div>

      <div className="grid gap-6">
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
