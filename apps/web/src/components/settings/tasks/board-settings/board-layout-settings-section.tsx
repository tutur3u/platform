'use client';

import { Columns3Cog } from '@tuturuuu/icons';
import type { WorkspaceTaskBoardDetail } from '@tuturuuu/internal-api/tasks';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import { BoardLayoutSettings } from '@tuturuuu/ui/tu-do/shared/board-layout-settings';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

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
  const [layoutOpen, setLayoutOpen] = useState(false);
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

      <Button
        className="gap-2"
        onClick={() => setLayoutOpen(true)}
        type="button"
        variant="outline"
      >
        <Columns3Cog className="h-4 w-4" />
        {t('settings.tasks.open_board_layout')}
      </Button>

      <BoardLayoutSettings
        boardId={board.id}
        lists={lists}
        onOpenChange={setLayoutOpen}
        onUpdate={onRefresh}
        open={layoutOpen}
        wsId={wsId}
      />
    </div>
  );
}
