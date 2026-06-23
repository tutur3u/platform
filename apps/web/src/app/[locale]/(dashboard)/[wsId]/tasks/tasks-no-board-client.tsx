'use client';

import {
  TASK_DEFAULT_BOARD_ID_CONFIG_ID,
  updateUserWorkspaceConfig,
} from '@tuturuuu/internal-api/users';
import { TaskBoardForm } from '@tuturuuu/ui/tu-do/boards/form';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface TasksNoBoardClientProps {
  routeWsId: string;
  workspaceId: string;
}

export function TasksNoBoardClient({
  routeWsId,
  workspaceId,
}: TasksNoBoardClientProps) {
  const router = useRouter();
  const t = useTranslations();

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div className="w-full max-w-3xl space-y-4 rounded-xl border bg-background p-4 shadow-sm">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl text-foreground">
            {t('ws-tasks.no_boards_title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('ws-tasks.no_boards_description')}
          </p>
        </div>
        <div className="rounded-lg border bg-muted/20">
          <TaskBoardForm
            data={{ name: t('ws-tasks.default_board_name') }}
            onFinish={(formData) => {
              const boardId = formData?.id;
              if (!boardId) return;

              void (async () => {
                await updateUserWorkspaceConfig(
                  workspaceId,
                  TASK_DEFAULT_BOARD_ID_CONFIG_ID,
                  boardId
                );
                router.replace(
                  `/${routeWsId}/tasks/boards/${boardId}?view=my_tasks`
                );
              })();
            }}
            wsId={workspaceId}
          />
        </div>
      </div>
    </div>
  );
}
