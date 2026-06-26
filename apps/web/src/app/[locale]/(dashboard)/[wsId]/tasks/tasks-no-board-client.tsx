'use client';

import {
  TASK_DEFAULT_BOARD_ID_CONFIG_ID,
  TASK_LAST_BOARD_VIEW_CONFIG_ID,
  updateUserWorkspaceConfig,
} from '@tuturuuu/internal-api/users';
import { TaskBoardForm } from '@tuturuuu/ui/tu-do/boards/form';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface TasksNoBoardClientProps {
  initialView?: string;
  routeWsId: string;
  workspaceId: string;
}

export function TasksNoBoardClient({
  initialView = 'my_tasks',
  routeWsId,
  workspaceId,
}: TasksNoBoardClientProps) {
  const router = useRouter();
  const t = useTranslations();

  return (
    <div
      className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8"
      data-testid="tasks-no-board-shell"
    >
      <div className="w-full max-w-3xl" data-testid="tasks-no-board-content">
        <TaskBoardForm
          data={{ name: t('ws-tasks.default_board_name') }}
          onFinish={(formData) => {
            const boardId = formData?.id;
            if (!boardId) return;

            void (async () => {
              await Promise.all([
                updateUserWorkspaceConfig(
                  workspaceId,
                  TASK_DEFAULT_BOARD_ID_CONFIG_ID,
                  boardId
                ),
                updateUserWorkspaceConfig(
                  workspaceId,
                  TASK_LAST_BOARD_VIEW_CONFIG_ID,
                  initialView
                ),
              ]);
              router.replace(
                `/${routeWsId}/tasks/boards/${boardId}?view=${initialView}`
              );
            })();
          }}
          wsId={workspaceId}
        />
      </div>
    </div>
  );
}
