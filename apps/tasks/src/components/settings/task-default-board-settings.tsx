'use client';

import { useQuery } from '@tanstack/react-query';
import { KanbanSquare, Plus } from '@tuturuuu/icons';
import { listWorkspaceTaskBoards } from '@tuturuuu/internal-api/tasks';
import { TASK_DEFAULT_BOARD_ID_CONFIG_ID } from '@tuturuuu/internal-api/users';
import { CreateBoardAnywhereDialog } from '@tuturuuu/tasks-ui/tu-do/boards/create-board-anywhere-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  useUpdateUserWorkspaceConfig,
  useUserWorkspaceConfig,
} from '@tuturuuu/ui/hooks/use-user-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

const AUTOMATIC_BOARD_VALUE = '__automatic__';

export function TaskDefaultBoardSettings({ wsId }: { wsId: string }) {
  const t = useTranslations('settings.tasks');
  const defaultBoardQuery = useUserWorkspaceConfig(
    wsId,
    TASK_DEFAULT_BOARD_ID_CONFIG_ID
  );
  const updateDefaultBoard = useUpdateUserWorkspaceConfig();
  const boardsQuery = useQuery({
    queryKey: ['task-settings-default-board', wsId],
    queryFn: () =>
      listWorkspaceTaskBoards(wsId, { pageSize: 100, status: 'active' }),
    staleTime: 30_000,
  });

  const boards = boardsQuery.data?.boards.filter(
    (board) => !board.deleted_at && !board.archived_at
  );
  const options = useMemo(
    () => [
      {
        value: AUTOMATIC_BOARD_VALUE,
        label: t('default_board_auto'),
        description: t('default_board_auto_description'),
        icon: <KanbanSquare className="size-4" />,
      },
      ...(boards ?? []).map((board) => ({
        value: board.id,
        label: board.name || t('board_default_list_untitled_board'),
        description: t('default_board_option_description'),
        icon: <KanbanSquare className="size-4" />,
      })),
    ],
    [boards, t]
  );

  const selectedBoardId =
    defaultBoardQuery.data &&
    boards?.some((board) => board.id === defaultBoardQuery.data)
      ? defaultBoardQuery.data
      : AUTOMATIC_BOARD_VALUE;

  const handleChange = (value: string | string[]) => {
    const nextValue = Array.isArray(value) ? value[0] : value;
    if (!nextValue) return;

    updateDefaultBoard.mutate(
      {
        configId: TASK_DEFAULT_BOARD_ID_CONFIG_ID,
        value: nextValue === AUTOMATIC_BOARD_VALUE ? null : nextValue,
        workspaceId: wsId,
      },
      {
        onSuccess: () => toast.success(t('default_board_saved')),
        onError: () => toast.error(t('default_board_save_failed')),
      }
    );
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-muted/20 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="font-semibold">{t('default_board')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('default_board_description')}
          </p>
        </div>
        <CreateBoardAnywhereDialog currentWorkspaceId={wsId}>
          <Button className="gap-2 sm:shrink-0" size="sm" type="button">
            <Plus className="size-4" />
            {t('create_board_anywhere')}
          </Button>
        </CreateBoardAnywhereDialog>
      </div>

      <SettingItemTab
        title={t('default_board')}
        description={t('default_board_description')}
      >
        <Combobox
          ariaLabel={t('default_board')}
          className="w-full sm:w-72"
          disabled={
            boardsQuery.isLoading ||
            defaultBoardQuery.isLoading ||
            updateDefaultBoard.isPending
          }
          emptyText={t('default_board_empty')}
          onChange={handleChange}
          options={options}
          placeholder={t('default_board_auto')}
          searchPlaceholder={t('default_board_search')}
          selected={selectedBoardId}
        />
      </SettingItemTab>
    </section>
  );
}
