'use client';

import type { PublicTaskBoardPayload } from '@tuturuuu/internal-api';
import { TaskDialogProvider } from '@tuturuuu/tasks-ui/tu-do/providers/task-dialog-provider';
import { BoardViews } from '@tuturuuu/tasks-ui/tu-do/shared/board-views';
import { ProgressiveLoaderProvider } from '@tuturuuu/tasks-ui/tu-do/shared/progressive-loader-context';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo-urls';
import { useMemo } from 'react';
import {
  createPublicTaskBoardProgressiveLoader,
  createPublicTaskBoardViewModel,
} from './public-task-board-model';

export function PublicTaskBoardContent({
  payload,
}: {
  payload: PublicTaskBoardPayload;
}) {
  const viewModel = useMemo(
    () => createPublicTaskBoardViewModel(payload),
    [payload]
  );
  const progressiveLoader = useMemo(
    () =>
      createPublicTaskBoardProgressiveLoader(viewModel.lists, viewModel.tasks),
    [viewModel.lists, viewModel.tasks]
  );

  return (
    <TaskDialogProvider isPersonalWorkspace={false}>
      <ProgressiveLoaderProvider value={progressiveLoader}>
        <BoardViews
          workspace={viewModel.workspace}
          board={viewModel.board}
          tasks={viewModel.tasks}
          lists={viewModel.lists}
          workspaceLabels={viewModel.workspaceLabels}
          canManageBoard={false}
          publicView
          readOnly
          availableViews={['kanban', 'list']}
          publicHeaderPrefix={
            <span className="flex shrink-0 items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-background">
                <img
                  alt="Tuturuuu Logo"
                  src={TUTURUUU_LOCAL_LOGO_URL}
                  width={24}
                  height={24}
                  className="h-6 w-6"
                />
              </span>
              <span className="font-semibold text-muted-foreground">/</span>
            </span>
          }
        />
      </ProgressiveLoaderProvider>
    </TaskDialogProvider>
  );
}
