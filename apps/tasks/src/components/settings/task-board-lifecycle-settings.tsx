'use client';

import type { WorkspaceTaskBoardDetail } from '@tuturuuu/internal-api/tasks';
import { BoardActions } from '@tuturuuu/tasks-ui/tu-do/boards/row-actions';
import {
  SettingsSection,
  SettingsSectionBlock,
} from '@tuturuuu/ui/custom/settings-section';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function TaskBoardLifecycleSettings({
  board,
  wsId,
}: {
  board: WorkspaceTaskBoardDetail;
  wsId: string;
}) {
  const router = useRouter();
  const t = useTranslations();

  return (
    <SettingsSection
      description={t('ws-task-boards.row_actions.settings_description')}
      title={t('common.actions')}
    >
      <SettingsSectionBlock>
        <BoardActions
          board={{ ...board, ws_id: board.ws_id ?? wsId }}
          display="settings"
          onBoardUnavailable={() => router.replace(`/${wsId}/boards`)}
          wsId={wsId}
        />
      </SettingsSectionBlock>
    </SettingsSection>
  );
}
