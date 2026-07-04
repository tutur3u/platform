'use client';

import type { Workspace } from '@tuturuuu/types';
import { BoardDefaultListSettings } from './tasks/board-default-list-settings';
import { DefaultTaskBoardSettings } from './tasks/default-task-board-settings';
import { TaskSettings } from './tasks/task-settings';

export function TaskGeneralSettingsPanel({
  workspace,
  wsId,
}: {
  workspace: Workspace | null;
  wsId?: string;
}) {
  return (
    <div className="h-full space-y-8">
      <TaskSettings workspace={workspace} />
      {wsId && <DefaultTaskBoardSettings wsId={wsId} />}
      {wsId && <BoardDefaultListSettings wsId={wsId} />}
    </div>
  );
}
