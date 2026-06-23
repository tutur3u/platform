'use client';

import { useQuery } from '@tanstack/react-query';
import { KanbanSquare } from '@tuturuuu/icons';
import { listWorkspaceTaskBoards } from '@tuturuuu/internal-api/tasks';
import { TASK_DEFAULT_BOARD_ID_CONFIG_ID } from '@tuturuuu/internal-api/users';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  useUpdateUserWorkspaceConfig,
  useUserWorkspaceConfig,
} from '@tuturuuu/ui/hooks/use-user-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

const AUTO_DEFAULT_BOARD_VALUE = '__first_active_board__';

export function DefaultTaskBoardSettings({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const { data: defaultBoardId } = useUserWorkspaceConfig(
    wsId,
    TASK_DEFAULT_BOARD_ID_CONFIG_ID,
    null
  );
  const updateConfig = useUpdateUserWorkspaceConfig();

  const { data, isLoading } = useQuery({
    queryKey: ['task-default-board-options', wsId],
    queryFn: () =>
      listWorkspaceTaskBoards(wsId, {
        page: 1,
        pageSize: 100,
        status: 'active',
      }),
    enabled: Boolean(wsId),
    staleTime: 60_000,
  });

  const options = useMemo<ComboboxOption[]>(
    () => [
      {
        value: AUTO_DEFAULT_BOARD_VALUE,
        label: t('settings.tasks.default_board_auto'),
        description: t('settings.tasks.default_board_auto_description'),
        icon: <KanbanSquare className="h-4 w-4" />,
      },
      ...(data?.boards ?? []).map((board) => ({
        value: board.id,
        label: board.name || t('common.untitled'),
        description: t('settings.tasks.default_board_option_description'),
        icon: <KanbanSquare className="h-4 w-4" />,
      })),
    ],
    [data?.boards, t]
  );

  const selected = defaultBoardId || AUTO_DEFAULT_BOARD_VALUE;

  return (
    <SettingItemTab
      title={t('settings.tasks.default_board')}
      description={t('settings.tasks.default_board_description')}
    >
      <Combobox
        ariaLabel={t('settings.tasks.default_board')}
        className="w-full max-w-md"
        contentWidth="lg"
        disabled={isLoading || updateConfig.isPending}
        emptyText={t('settings.tasks.default_board_empty')}
        onChange={(value) => {
          const nextValue = Array.isArray(value) ? value[0] : value;
          if (!nextValue) return;

          updateConfig.mutate(
            {
              configId: TASK_DEFAULT_BOARD_ID_CONFIG_ID,
              value: nextValue === AUTO_DEFAULT_BOARD_VALUE ? null : nextValue,
              workspaceId: wsId,
            },
            {
              onSuccess: () =>
                toast.success(t('settings.tasks.default_board_saved')),
              onError: () =>
                toast.error(t('settings.tasks.default_board_save_failed')),
            }
          );
        }}
        options={options}
        placeholder={t('settings.tasks.default_board')}
        searchPlaceholder={t('common.search_boards')}
        selected={selected}
      />
    </SettingItemTab>
  );
}
