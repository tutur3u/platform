'use client';

import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import MyTasksContent from '../my-tasks/my-tasks-content';

/** The board's "My tasks" view: the viewer's own tasks, embedded in the board frame. */
export function MyTasksBoardPanel({
  board,
  boardLists,
  currentUserId,
  isPersonal,
  workspaceId,
}: {
  board: Pick<WorkspaceTaskBoard, 'id' | 'name' | 'default_list_id'>;
  boardLists: TaskList[];
  currentUserId?: string;
  isPersonal: boolean;
  workspaceId: string;
}) {
  return (
    <div className="h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto max-w-5xl pb-20">
        {currentUserId ? (
          <MyTasksContent
            disableAutoCreateBoard
            embedded
            initialBoard={{
              id: board.id,
              name: board.name ?? null,
            }}
            initialLists={boardLists}
            initialListId={board.default_list_id ?? undefined}
            isPersonal={isPersonal}
            userId={currentUserId}
            wsId={workspaceId}
          />
        ) : null}
      </div>
    </div>
  );
}
