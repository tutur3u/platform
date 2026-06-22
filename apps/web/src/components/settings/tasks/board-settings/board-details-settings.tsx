'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from '@tuturuuu/icons';
import {
  updateWorkspaceTaskBoard,
  type WorkspaceTaskBoardDetail,
} from '@tuturuuu/internal-api/tasks';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { TaskBoardForm } from '@tuturuuu/ui/tu-do/boards/form';
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
  const [ticketPrefix, setTicketPrefix] = useState(board.ticket_prefix ?? '');
  const [defaultListId, setDefaultListId] = useState(
    board.default_list_id ?? NO_DEFAULT_LIST
  );

  useEffect(() => {
    setTicketPrefix(board.ticket_prefix ?? '');
    setDefaultListId(board.default_list_id ?? NO_DEFAULT_LIST);
  }, [board.default_list_id, board.ticket_prefix]);

  const listOptions = useMemo(
    () => [
      {
        label: t('settings.tasks.no_default_list'),
        value: NO_DEFAULT_LIST,
      },
      ...(board.task_lists ?? [])
        .filter((list) => !list.deleted)
        .map((list) => ({
          label:
            list.name || t('settings.tasks.board_default_list_untitled_list'),
          value: list.id,
        })),
    ],
    [board.task_lists, t]
  );

  const updatePreferencesMutation = useMutation({
    mutationFn: () =>
      updateWorkspaceTaskBoard(
        wsId,
        board.id,
        {
          default_list_id:
            defaultListId === NO_DEFAULT_LIST ? null : defaultListId,
          ticket_prefix: ticketPrefix.trim().toUpperCase() || null,
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

      <TaskBoardForm
        data={{
          icon: board.icon,
          id: board.id,
          name: board.name ?? undefined,
        }}
        onFinish={onRefresh}
        showCancel={false}
        wsId={wsId}
      />

      <Separator />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
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

        <Button
          disabled={updatePreferencesMutation.isPending}
          onClick={() => updatePreferencesMutation.mutate()}
          type="button"
        >
          {updatePreferencesMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {t('settings.tasks.save_board_preferences')}
        </Button>
      </div>
    </div>
  );
}
