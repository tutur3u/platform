'use client';

import useTranslation from 'next-translate/useTranslation';
import { Workspace } from '@/types/primitives/Workspace';
import NameInput from './name-input';

interface Props {
  workspace: Workspace | null;
  allowEdit?: boolean;
}

export default function BasicInfo({ workspace, allowEdit }: Props) {
  const { t } = useTranslation('ws-settings');

  if (!workspace) return null;

  return (
    <div className="flex flex-col rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
      <div className="mb-1 text-2xl font-bold">{t('basic_info')}</div>
      <div className="mb-4 font-semibold text-zinc-500">
        {t('basic_info_description')}
      </div>

      <NameInput
        wsId={workspace.id}
        defaultValue={workspace.name}
        disabled={!allowEdit}
      />
    </div>
  );
}
