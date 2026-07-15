'use client';

import type { WorkspaceTaskBoardDetail } from '@tuturuuu/internal-api/tasks';
import { BoardLayoutSettingsContent } from '@tuturuuu/tasks-ui/tu-do/shared/board-layout-settings';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

function toTaskList(
  list: NonNullable<WorkspaceTaskBoardDetail['task_lists']>[number],
  boardId: string
): TaskList {
  return {
    archived: false,
    board_id: boardId,
    color: (list.color ?? 'GRAY') as TaskList['color'],
    created_at: '',
    creator_id: '',
    deleted: list.deleted ?? false,
    id: list.id,
    name: list.name ?? '',
    position: list.position ?? 0,
    status: (list.status ?? 'not_started') as TaskList['status'],
  };
}

export function BoardLayoutSettingsSection({
  board,
  onRefresh,
  wsId,
}: {
  board: WorkspaceTaskBoardDetail;
  onRefresh: () => void;
  wsId: string;
}) {
  const t = useTranslations();
  const lists = useMemo(
    () => (board.task_lists ?? []).map((list) => toTaskList(list, board.id)),
    [board.id, board.task_lists]
  );

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div className="space-y-1">
        <h3 className="font-medium">{t('settings.tasks.board_layout')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('settings.tasks.board_layout_description')}
        </p>
      </div>

      <BoardLayoutSettingsContent
        boardId={board.id}
        disableScrollArea
        lists={lists}
        onUpdate={onRefresh}
        wsId={wsId}
      />
    </div>
  );
}
