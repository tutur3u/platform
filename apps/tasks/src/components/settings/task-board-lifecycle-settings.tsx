'use client';

import type { WorkspaceTaskBoardDetail } from '@tuturuuu/internal-api/tasks';
import { BoardActions } from '@tuturuuu/tasks-ui/tu-do/boards/row-actions';
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
    <div className="space-y-4 rounded-2xl border bg-background p-4 sm:p-5">
      <div className="space-y-1">
        <h3 className="font-medium">{t('common.actions')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('ws-task-boards.row_actions.settings_description')}
        </p>
      </div>
      <BoardActions
        board={{ ...board, ws_id: board.ws_id ?? wsId }}
        display="settings"
        onBoardUnavailable={() => router.replace(`/${wsId}/boards`)}
        wsId={wsId}
      />
    </div>
  );
}
