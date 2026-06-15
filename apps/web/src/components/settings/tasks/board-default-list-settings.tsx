'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { apiFetch, HttpError } from '@/lib/api-fetch';

const NONE_VALUE = '__none__';

interface BoardListSummary {
  id: string;
  name: string | null;
  deleted?: boolean | null;
}

interface BoardWithLists {
  id: string;
  name: string | null;
  default_list_id: string | null;
  task_lists: BoardListSummary[];
}

/**
 * Per-board "default list for new tasks" control, shown in the global Settings
 * dialog under Tasks. Lists every board in the workspace with an inline list
 * dropdown. Mirrors the per-board setting also exposed in the board header.
 */
export function BoardDefaultListSettings({ wsId }: { wsId: string }) {
  const t = useTranslations('settings.tasks');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['boards-with-lists', wsId],
    queryFn: () =>
      apiFetch<{ boards: BoardWithLists[] }>(
        `/api/v1/workspaces/${wsId}/boards-with-lists`,
        { cache: 'no-store' }
      ),
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      boardId,
      defaultListId,
    }: {
      boardId: string;
      defaultListId: string | null;
    }) =>
      apiFetch(`/api/v1/workspaces/${wsId}/task-boards/${boardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_list_id: defaultListId }),
      }),
    onSuccess: (_result, { boardId }) => {
      queryClient.invalidateQueries({
        queryKey: ['boards-with-lists', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['task-board', wsId, boardId],
      });
      toast.success(t('board_default_list_update_success'));
    },
    onError: (error) => {
      toast.error(
        error instanceof HttpError
          ? error.message
          : t('board_default_list_update_error')
      );
    },
  });

  const boards = data?.boards ?? [];

  return (
    <SettingItemTab
      title={t('board_default_list')}
      description={t('board_default_list_description')}
    >
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : boards.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t('board_default_list_empty')}
        </p>
      ) : (
        <div className="grid gap-3">
          {boards.map((board) => {
            const lists = (board.task_lists ?? []).filter(
              (list) => !list.deleted
            );

            return (
              <div
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                key={board.id}
              >
                <span className="truncate font-medium text-sm">
                  {board.name || t('board_default_list_untitled_board')}
                </span>
                <Select
                  disabled={lists.length === 0 || updateMutation.isPending}
                  onValueChange={(value) =>
                    updateMutation.mutate({
                      boardId: board.id,
                      defaultListId: value === NONE_VALUE ? null : value,
                    })
                  }
                  value={board.default_list_id ?? NONE_VALUE}
                >
                  <SelectTrigger className="w-full sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>
                      {t('board_default_list_none')}
                    </SelectItem>
                    {lists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name || t('board_default_list_untitled_list')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      )}
    </SettingItemTab>
  );
}
