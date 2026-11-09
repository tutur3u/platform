'use client';

import type { Workspace } from '@tuturuuu/types';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import HandleInput from './handle-input';
import WorkspaceIDCopy from './id-copy';
import NameInput from './name-input';

interface Props {
  workspace?: Workspace | null;
  allowEdit?: boolean;
  isPersonal?: boolean;
  /** More rows for the same card. */
  children?: ReactNode;
}

export default function BasicInfo({
  workspace,
  allowEdit,
  isPersonal,
  children,
}: Props) {
  const t = useTranslations('ws-settings');

  if (!workspace) return null;

  return (
    <SettingsSection
      description={t('basic_info_description')}
      title={t('basic_info')}
    >
      {isPersonal || (
        <>
          <NameInput
            wsId={workspace.id}
            defaultValue={workspace.name}
            disabled={allowEdit === false}
          />
          <HandleInput
            wsId={workspace.id}
            defaultName={workspace.name}
            defaultValue={workspace.handle}
            disabled={allowEdit === false}
          />
        </>
      )}
      <WorkspaceIDCopy wsId={workspace.id} />
      {children}
    </SettingsSection>
  );
}
