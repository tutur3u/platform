import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, LayoutGrid, Trash2 } from '@tuturuuu/icons';
import {
  type AccessibleWorkspaceTaskBoard,
  createWorkspaceTaskBoard,
  listCurrentUserTaskBoards,
} from '@tuturuuu/internal-api/tasks';
import {
  isTaskRememberLastBoardEnabled,
  TASK_DEFAULT_BOARD_ID_CONFIG_ID,
  TASK_REMEMBER_LAST_BOARD_CONFIG_ID,
} from '@tuturuuu/internal-api/users';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import {
  getIconComponentByKey,
  type PlatformIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
import {
  useUpdateUserWorkspaceConfig,
  useUserWorkspaceConfig,
} from '@tuturuuu/ui/hooks/use-user-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { useTasksHref } from '../tasks-route-context';

interface BoardSwitcherProps {
  board: Pick<WorkspaceTaskBoard, 'id' | 'name' | 'ws_id' | 'ticket_prefix'> & {
    icon?: WorkspaceTaskBoard['icon'];
  };
  translations?: {
    loadingBoards?: string;
    noOtherBoards?: string;
    activeBoards?: string;
    archivedBoards?: string;
    deletedBoards?: string;
    untitled?: string;
    active?: string;
    archived?: string;
    deleted?: string;
    daysLeft?: string;
    searchBoards?: string;
    tasks?: string;
    createBoard?: string;
    creatingBoard?: string;
    createBoardError?: string;
  };
}

type BoardWithStatus = {
  access_type?: 'member' | 'guest';
  id: string;
  name: string | null;
  icon: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string | null;
  workspace?: AccessibleWorkspaceTaskBoard['workspace'];
  ws_id: string;
};

function getDaysRemaining(deletedAt: string) {
  const deletedDate = new Date(deletedAt);
  const now = new Date();
  const daysPassed = Math.floor(
    (now.getTime() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, 30 - daysPassed);
}

export function BoardSwitcher({ board, translations }: BoardSwitcherProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tasksHref = useTasksHref();
  const { data: rememberLastBoardRaw } = useUserWorkspaceConfig(
    board.ws_id,
    TASK_REMEMBER_LAST_BOARD_CONFIG_ID,
    'true'
  );
  const updateUserWorkspaceConfig = useUpdateUserWorkspaceConfig();

  const t = {
    loadingBoards: translations?.loadingBoards ?? 'Loading boards...',
    noOtherBoards: translations?.noOtherBoards ?? 'No other boards',
    activeBoards: translations?.activeBoards ?? 'Active boards',
    archivedBoards: translations?.archivedBoards ?? 'Archived boards',
    deletedBoards: translations?.deletedBoards ?? 'Deleted boards',
    untitled: translations?.untitled ?? 'Untitled',
    active: translations?.active ?? 'Active',
    archived: translations?.archived ?? 'Archived',
    deleted: translations?.deleted ?? 'Deleted',
    daysLeft: translations?.daysLeft ?? '{count} days left',
    searchBoards: translations?.searchBoards ?? 'Search boards',
    tasks: translations?.tasks ?? 'Tasks',
    createBoard: translations?.createBoard ?? 'Create board',
    creatingBoard: translations?.creatingBoard ?? 'Creating',
    createBoardError:
      translations?.createBoardError ?? 'Could not create board',
  };

  const translateBoardName = useCallback(
    (name: string | null): string => {
      if (!name) return t.untitled;
      if (name.toLowerCase() === 'tasks') return t.tasks;
      return name;
    },
    [t.tasks, t.untitled]
  );

  const { data: boards = [], isLoading: isFetchingBoards } = useQuery({
    queryKey: ['accessible-task-boards'],
    queryFn: async () => {
      const payload = await listCurrentUserTaskBoards();
      return (payload.boards || []) as BoardWithStatus[];
    },
  });
  const rememberLastBoard =
    isTaskRememberLastBoardEnabled(rememberLastBoardRaw);
  const boardsById = useMemo(() => {
    return new Map(boards.map((item) => [item.id, item] as const));
  }, [boards]);

  const selectBoard = useCallback(
    (value: string | string[]) => {
      const boardId = Array.isArray(value) ? value[0] : value;
      if (!boardId || boardId === board.id) return;

      const selectedBoard = boardsById.get(boardId);
      const targetWorkspaceId = selectedBoard?.ws_id ?? board.ws_id;

      if (rememberLastBoard && targetWorkspaceId === board.ws_id) {
        updateUserWorkspaceConfig.mutate({
          configId: TASK_DEFAULT_BOARD_ID_CONFIG_ID,
          value: boardId,
          workspaceId: board.ws_id,
        });
      }

      router.push(`/${targetWorkspaceId}${tasksHref(`/boards/${boardId}`)}`);
    },
    [
      board.id,
      board.ws_id,
      boardsById,
      rememberLastBoard,
      router,
      tasksHref,
      updateUserWorkspaceConfig,
    ]
  );

  const createBoard = useCallback(
    async (value: string) => {
      const name = value.trim();
      if (!name) return;

      try {
        const payload = await createWorkspaceTaskBoard(board.ws_id, { name });
        await queryClient.invalidateQueries({
          queryKey: ['accessible-task-boards'],
        });

        return {
          label: translateBoardName(payload.board.name ?? name),
          value: payload.board.id,
        };
      } catch (error) {
        toast.error(t.createBoardError);
        throw error;
      }
    },
    [board.ws_id, queryClient, t.createBoardError, translateBoardName]
  );

  const currentBoardFromAccessible = boardsById.get(board.id);
  const canCreateBoard = currentBoardFromAccessible?.access_type !== 'guest';

  const boardOptions = useMemo(() => {
    const byId = new Map<string, BoardWithStatus>();
    for (const item of boards) byId.set(item.id, item);
    if (!byId.has(board.id)) {
      byId.set(board.id, {
        id: board.id,
        name: board.name ?? null,
        icon: board.icon ?? null,
        archived_at: null,
        deleted_at: null,
        created_at: null,
        ws_id: board.ws_id,
      });
    }

    const orderedBoards = [...byId.values()].sort((a, b) => {
      const workspaceDelta =
        (a.ws_id === board.ws_id ? 0 : 1) - (b.ws_id === board.ws_id ? 0 : 1);
      if (workspaceDelta !== 0) return workspaceDelta;

      const currentBoardDelta =
        (a.id === board.id ? 0 : 1) - (b.id === board.id ? 0 : 1);
      if (currentBoardDelta !== 0) return currentBoardDelta;

      const workspaceNameDelta = (a.workspace?.name ?? a.ws_id).localeCompare(
        b.workspace?.name ?? b.ws_id
      );
      if (workspaceNameDelta !== 0) return workspaceNameDelta;

      const statusWeight = (item: BoardWithStatus) =>
        item.deleted_at ? 2 : item.archived_at ? 1 : 0;
      const statusDelta = statusWeight(a) - statusWeight(b);
      if (statusDelta !== 0) return statusDelta;
      return translateBoardName(a.name).localeCompare(
        translateBoardName(b.name)
      );
    });

    return orderedBoards.map((item): ComboboxOption => {
      const BoardIcon =
        getIconComponentByKey(item.icon as PlatformIconKey | null) ??
        LayoutGrid;
      const isDeleted = Boolean(item.deleted_at);
      const isArchived = Boolean(item.archived_at && !item.deleted_at);
      const statusLabel = isDeleted
        ? t.deleted
        : isArchived
          ? t.archived
          : t.active;
      const workspaceLabel = item.workspace?.name ?? item.ws_id;
      const groupLabel = isDeleted
        ? t.deletedBoards
        : isArchived
          ? t.archivedBoards
          : t.activeBoards;
      const daysRemaining =
        item.deleted_at && getDaysRemaining(item.deleted_at);
      const description = daysRemaining
        ? `${groupLabel} · ${t.daysLeft.replace(
            '{count}',
            String(daysRemaining)
          )}`
        : isArchived || isDeleted
          ? groupLabel
          : undefined;
      const badge =
        isArchived || isDeleted ? (
          <Badge
            key={`${item.id}-status`}
            className={cn(
              'shrink-0 gap-1 px-2 py-0.5 text-[10px]',
              isDeleted && 'bg-dynamic-red/10 text-dynamic-red',
              isArchived && 'bg-muted text-foreground'
            )}
          >
            {isDeleted ? (
              <Trash2 className="h-3 w-3 text-dynamic-red/50" />
            ) : (
              <Archive className="h-3 w-3 text-foreground/50" />
            )}
            {statusLabel}
          </Badge>
        ) : undefined;

      return {
        value: item.id,
        label: translateBoardName(item.name),
        searchValue: [
          translateBoardName(item.name),
          workspaceLabel,
          statusLabel,
          groupLabel,
          daysRemaining
            ? t.daysLeft.replace('{count}', String(daysRemaining))
            : null,
        ]
          .filter(Boolean)
          .join(' '),
        description,
        group: workspaceLabel,
        icon: <BoardIcon className="h-4 w-4" />,
        muted: isArchived || isDeleted,
        badge,
      };
    });
  }, [
    board.icon,
    board.id,
    board.name,
    board.ws_id,
    boards,
    t.active,
    t.activeBoards,
    t.archived,
    t.archivedBoards,
    t.daysLeft,
    t.deleted,
    t.deletedBoards,
    translateBoardName,
  ]);

  return (
    <Combobox
      className="w-[min(22rem,70vw)] [&_button]:h-7 [&_button]:min-h-7 [&_button]:px-2 sm:[&_button]:h-8 sm:[&_button]:min-h-8"
      createText={canCreateBoard ? t.createBoard : undefined}
      creatingText={canCreateBoard ? t.creatingBoard : undefined}
      disabled={isFetchingBoards}
      emptyText={isFetchingBoards ? t.loadingBoards : t.noOtherBoards}
      label={
        <span className="truncate font-semibold text-foreground text-sm">
          {translateBoardName(board.name)}
        </span>
      }
      onChange={selectBoard}
      onCreate={canCreateBoard ? createBoard : undefined}
      options={boardOptions}
      placeholder={translateBoardName(board.name)}
      searchPlaceholder={t.searchBoards}
      selected={board.id}
    />
  );
}
