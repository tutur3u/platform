'use client';

import type { WorkspaceTaskBoardDetail } from '@tuturuuu/internal-api/tasks';
import { BoardActions } from '@tuturuuu/tasks-ui/tu-do/boards/row-actions';
import { SettingsGroup } from '@tuturuuu/tasks-ui/tu-do/shared/settings-group';
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
    <SettingsGroup
      description={t('ws-task-boards.row_actions.settings_description')}
      title={t('common.actions')}
    >
      <div className="p-4">
        <BoardActions
          board={{ ...board, ws_id: board.ws_id ?? wsId }}
          display="settings"
          onBoardUnavailable={() => router.replace(`/${wsId}/boards`)}
          wsId={wsId}
        />
      </div>
    </SettingsGroup>
  );
}
