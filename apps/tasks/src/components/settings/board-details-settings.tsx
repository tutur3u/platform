'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from '@tuturuuu/icons';
import {
  updateWorkspaceTaskBoard,
  type WorkspaceTaskBoardDetail,
} from '@tuturuuu/internal-api/tasks';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import IconPicker from '@tuturuuu/ui/custom/icon-picker';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

/** Name, icon and default list. Task ID prefixes belong to projects. */
export function BoardDetailsSettings({
  board,
  onRefresh,
  wsId,
}: {
  board: WorkspaceTaskBoardDetail;
  onRefresh: () => void;
  wsId: string;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [boardName, setBoardName] = useState(board.name ?? '');
  const [boardIcon, setBoardIcon] = useState<string | null>(board.icon ?? null);
  const [defaultListId, setDefaultListId] = useState(
    board.default_list_id ?? '__none__'
  );

  useEffect(() => {
    setBoardName(board.name ?? '');
    setBoardIcon(board.icon ?? null);
    setDefaultListId(board.default_list_id ?? '__none__');
  }, [board.default_list_id, board.icon, board.name]);

  const listOptions = useMemo(
    () => [
      {
        label: t('settings.tasks.no_default_list'),
        value: '__none__',
      },
      ...(board.task_lists ?? [])
        .filter((list) => !list.deleted)
        .map((list) => ({
          label: list.name || t('settings.tasks.untitled_list'),
          value: list.id,
        })),
    ],
    [board.task_lists, t]
  );

  const normalizedBoardName =
    boardName.trim() || t('ws-task-boards.unnamed_board');
  const normalizedDefaultListId =
    defaultListId === '__none__' ? null : defaultListId;
  const isDirty =
    normalizedBoardName !== (board.name || t('ws-task-boards.unnamed_board')) ||
    (boardIcon ?? null) !== (board.icon ?? null) ||
    normalizedDefaultListId !== (board.default_list_id ?? null);

  const updateBoardMutation = useMutation({
    mutationFn: () =>
      updateWorkspaceTaskBoard(
        wsId,
        board.id,
        {
          default_list_id: normalizedDefaultListId,
          icon: boardIcon as WorkspaceTaskBoardDetail['icon'],
          name: normalizedBoardName,
        },
        getBrowserInternalApiOptions()
      ),
    onSuccess: async () => {
      toast.success(t('ws-task-boards.toast.update_success'));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['task-board-settings', wsId, board.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-board', wsId, board.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['boards', wsId],
        }),
      ]);
      onRefresh();
    },
    onError: (error) => {
      toast.error(t('ws-task-boards.errors.unexpected'), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  return (
    <SettingsSection
      action={
        <Button
          disabled={updateBoardMutation.isPending || !isDirty}
          onClick={() => updateBoardMutation.mutate()}
          size="sm"
          type="button"
        >
          {updateBoardMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {t('common.save_changes')}
        </Button>
      }
      title={t('settings.tasks.board_details')}
    >
      <SettingItemTab
        controlClassName="flex items-center gap-2"
        controlWidth="xl"
        description={t('ws-task-boards.icon_picker.description')}
        title={<label htmlFor="board-name">{t('ws-task-boards.name')}</label>}
      >
        <IconPicker
          ariaLabel={t('ws-task-boards.icon_picker.title')}
          clearLabel={t('ws-task-boards.icon_picker.clear')}
          description={t('ws-task-boards.icon_picker.description')}
          onValueChange={setBoardIcon}
          searchPlaceholder={t('ws-task-boards.icon_picker.search_placeholder')}
          title={t('ws-task-boards.icon_picker.title')}
          triggerClassName="size-9 shrink-0"
          value={boardIcon}
        />
        <Input
          autoComplete="off"
          className="w-full"
          id="board-name"
          onChange={(event) => setBoardName(event.target.value)}
          placeholder={t('ws-task-boards.unnamed_board')}
          value={boardName}
        />
      </SettingItemTab>
      <SettingItemTab
        controlWidth="xl"
        title={t('settings.tasks.default_list')}
      >
        <Combobox
          contentWidth="md"
          mode="single"
          onChange={(value) => {
            if (typeof value === 'string') setDefaultListId(value);
          }}
          options={listOptions}
          placeholder={t('settings.tasks.no_default_list')}
          searchPlaceholder={t('common.search_tasks')}
          selected={defaultListId}
        />
      </SettingItemTab>
    </SettingsSection>
  );
}
