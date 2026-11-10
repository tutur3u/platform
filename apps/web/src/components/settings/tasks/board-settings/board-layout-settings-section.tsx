'use client';

import type { WorkspaceTaskBoardDetail } from '@tuturuuu/internal-api/tasks';
import { BoardLayoutSettingsContent } from '@tuturuuu/tasks-ui/tu-do/shared/board-layout-settings';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
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
    <SettingsSection surface="plain" title={t('settings.tasks.board_layout')}>
      <BoardLayoutSettingsContent
        boardId={board.id}
        disableScrollArea
        lists={lists}
        onUpdate={onRefresh}
        wsId={wsId}
      />
    </SettingsSection>
  );
}
