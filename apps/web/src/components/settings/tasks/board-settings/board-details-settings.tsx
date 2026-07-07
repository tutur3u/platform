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
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

const NO_DEFAULT_LIST = '__none__';

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

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
  const [ticketPrefix, setTicketPrefix] = useState(board.ticket_prefix ?? '');
  const [defaultListId, setDefaultListId] = useState(
    board.default_list_id ?? NO_DEFAULT_LIST
  );
  const [defaultDoneListId, setDefaultDoneListId] = useState(
    board.default_done_list_id ?? NO_DEFAULT_LIST
  );
  const [defaultClosedListId, setDefaultClosedListId] = useState(
    board.default_closed_list_id ?? NO_DEFAULT_LIST
  );

  useEffect(() => {
    setBoardName(board.name ?? '');
    setBoardIcon(board.icon ?? null);
    setTicketPrefix(board.ticket_prefix ?? '');
    setDefaultListId(board.default_list_id ?? NO_DEFAULT_LIST);
    setDefaultDoneListId(board.default_done_list_id ?? NO_DEFAULT_LIST);
    setDefaultClosedListId(board.default_closed_list_id ?? NO_DEFAULT_LIST);
  }, [
    board.default_closed_list_id,
    board.default_done_list_id,
    board.default_list_id,
    board.icon,
    board.name,
    board.ticket_prefix,
  ]);

  const activeLists = useMemo(
    () => (board.task_lists ?? []).filter((list) => !list.deleted),
    [board.task_lists]
  );

  const listOptions = useMemo(
    () => [
      {
        label: t('settings.tasks.no_default_list'),
        value: NO_DEFAULT_LIST,
      },
      ...activeLists.map((list) => ({
        label:
          list.name || t('settings.tasks.board_default_list_untitled_list'),
        value: list.id,
      })),
    ],
    [activeLists, t]
  );

  const doneListOptions = useMemo(
    () => [
      {
        label: t('settings.tasks.no_default_done_list'),
        value: NO_DEFAULT_LIST,
      },
      ...activeLists
        .filter((list) => list.status === 'done')
        .map((list) => ({
          label:
            list.name || t('settings.tasks.board_default_list_untitled_list'),
          value: list.id,
        })),
    ],
    [activeLists, t]
  );

  const closedListOptions = useMemo(
    () => [
      {
        label: t('settings.tasks.no_default_closed_list'),
        value: NO_DEFAULT_LIST,
      },
      ...activeLists
        .filter((list) => list.status === 'closed')
        .map((list) => ({
          label:
            list.name || t('settings.tasks.board_default_list_untitled_list'),
          value: list.id,
        })),
    ],
    [activeLists, t]
  );

  const normalizedBoardName =
    boardName.trim() || t('ws-task-boards.unnamed_board');
  const normalizedTicketPrefix = ticketPrefix.trim().toUpperCase() || null;
  const normalizedDefaultListId =
    defaultListId === NO_DEFAULT_LIST ? null : defaultListId;
  const normalizedDefaultDoneListId =
    defaultDoneListId === NO_DEFAULT_LIST ? null : defaultDoneListId;
  const normalizedDefaultClosedListId =
    defaultClosedListId === NO_DEFAULT_LIST ? null : defaultClosedListId;
  const isDirty =
    normalizedBoardName !== (board.name || t('ws-task-boards.unnamed_board')) ||
    (boardIcon ?? null) !== (board.icon ?? null) ||
    normalizedTicketPrefix !== (board.ticket_prefix ?? null) ||
    normalizedDefaultListId !== (board.default_list_id ?? null) ||
    normalizedDefaultDoneListId !== (board.default_done_list_id ?? null) ||
    normalizedDefaultClosedListId !== (board.default_closed_list_id ?? null);

  const updateBoardMutation = useMutation({
    mutationFn: () =>
      updateWorkspaceTaskBoard(
        wsId,
        board.id,
        {
          default_list_id: normalizedDefaultListId,
          default_done_list_id: normalizedDefaultDoneListId,
          default_closed_list_id: normalizedDefaultClosedListId,
          icon: boardIcon as WorkspaceTaskBoardDetail['icon'],
          name: normalizedBoardName,
          ticket_prefix: normalizedTicketPrefix,
        },
        getBrowserInternalApiOptions()
      ),
    onSuccess: async () => {
      toast.success(t('settings.tasks.board_preferences_saved'));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['task-board', wsId, board.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['board-config', wsId, board.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-board-settings', wsId, board.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['other-boards', wsId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['boards', wsId],
        }),
      ]);
      onRefresh();
    },
    onError: (error) => {
      toast.error(t('settings.tasks.board_preferences_update_failed'), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  return (
    <div className="space-y-5 rounded-lg border bg-background p-4">
      <div className="space-y-1">
        <h3 className="font-medium">{t('settings.tasks.board_details')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('settings.tasks.board_details_description')}
        </p>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
          <div className="w-fit space-y-2">
            <Label className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              {t('ws-task-boards.icon_label')}
            </Label>
            <div className="flex">
              <IconPicker
                ariaLabel={t('ws-task-boards.icon_picker.title')}
                clearLabel={t('ws-task-boards.icon_picker.clear')}
                description={t('ws-task-boards.icon_picker.description')}
                onValueChange={setBoardIcon}
                searchPlaceholder={t(
                  'ws-task-boards.icon_picker.search_placeholder'
                )}
                title={t('ws-task-boards.icon_picker.title')}
                value={boardIcon}
              />
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <Label
              className="font-semibold text-muted-foreground text-xs uppercase tracking-wider"
              htmlFor="board-name"
            >
              {t('ws-task-boards.name')}
            </Label>
            <Input
              autoComplete="off"
              id="board-name"
              onChange={(event) => setBoardName(event.target.value)}
              placeholder={t('ws-task-boards.unnamed_board')}
              value={boardName}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label htmlFor="board-ticket-prefix">
              {t('settings.tasks.ticket_prefix')}
            </Label>
            <Input
              id="board-ticket-prefix"
              maxLength={12}
              onChange={(event) => setTicketPrefix(event.target.value)}
              placeholder={t('settings.tasks.ticket_prefix_placeholder')}
              value={ticketPrefix}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('settings.tasks.default_list')}</Label>
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
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label>{t('settings.tasks.default_done_list')}</Label>
            <Combobox
              contentWidth="md"
              mode="single"
              onChange={(value) => {
                if (typeof value === 'string') setDefaultDoneListId(value);
              }}
              options={doneListOptions}
              placeholder={t('settings.tasks.no_default_done_list')}
              searchPlaceholder={t('common.search_tasks')}
              selected={defaultDoneListId}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('settings.tasks.default_closed_list')}</Label>
            <Combobox
              contentWidth="md"
              mode="single"
              onChange={(value) => {
                if (typeof value === 'string') setDefaultClosedListId(value);
              }}
              options={closedListOptions}
              placeholder={t('settings.tasks.no_default_closed_list')}
              searchPlaceholder={t('common.search_tasks')}
              selected={defaultClosedListId}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            disabled={updateBoardMutation.isPending || !isDirty}
            onClick={() => updateBoardMutation.mutate()}
            type="button"
          >
            {updateBoardMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t('common.save_changes')}
          </Button>
        </div>
      </div>
    </div>
  );
}
