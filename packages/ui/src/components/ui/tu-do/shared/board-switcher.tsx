import { useQuery } from '@tanstack/react-query';
import { Archive, CheckCircle2, LayoutGrid, Trash2 } from '@tuturuuu/icons';
import { listWorkspaceTaskBoards } from '@tuturuuu/internal-api';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
  getIconComponentByKey,
  type PlatformIconKey,
} from '../../custom/icon-picker';
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
  };
}

type BoardWithStatus = {
  id: string;
  name: string | null;
  icon: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string | null;
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
  const tasksHref = useTasksHref();

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
    queryKey: ['other-boards', board.ws_id, board.id],
    queryFn: async () => {
      const payload = await listWorkspaceTaskBoards(board.ws_id);
      return (payload.boards || []) as BoardWithStatus[];
    },
    enabled: !!board.ws_id,
  });

  const CurrentBoardIcon =
    getIconComponentByKey(board.icon as PlatformIconKey | null) ?? LayoutGrid;

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
      });
    }

    const orderedBoards = [...byId.values()].sort((a, b) => {
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
      const groupLabel = isDeleted
        ? t.deletedBoards
        : isArchived
          ? t.archivedBoards
          : t.activeBoards;
      const daysRemaining =
        item.deleted_at && getDaysRemaining(item.deleted_at);

      return {
        value: item.id,
        label: translateBoardName(item.name),
        searchValue: [
          translateBoardName(item.name),
          statusLabel,
          groupLabel,
          daysRemaining
            ? t.daysLeft.replace('{count}', String(daysRemaining))
            : null,
        ]
          .filter(Boolean)
          .join(' '),
        description: daysRemaining
          ? `${groupLabel} · ${t.daysLeft.replace(
              '{count}',
              String(daysRemaining)
            )}`
          : groupLabel,
        icon: <BoardIcon className="h-4 w-4" />,
        muted: isArchived || isDeleted,
        badge: (
          <Badge
            className={cn(
              'shrink-0 gap-1 px-2 py-0.5 text-[10px]',
              isDeleted && 'bg-dynamic-red/10 text-dynamic-red',
              isArchived && 'bg-muted text-foreground',
              !isDeleted &&
                !isArchived &&
                'bg-dynamic-green/10 text-dynamic-green'
            )}
          >
            {isDeleted ? (
              <Trash2 className="h-3 w-3 text-dynamic-red/50" />
            ) : isArchived ? (
              <Archive className="h-3 w-3 text-foreground/50" />
            ) : (
              <CheckCircle2 className="h-3 w-3 text-dynamic-green/50" />
            )}
            {statusLabel}
          </Badge>
        ),
      };
    });
  }, [
    board.icon,
    board.id,
    board.name,
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
      className="w-[min(22rem,70vw)]"
      disabled={isFetchingBoards}
      emptyText={isFetchingBoards ? t.loadingBoards : t.noOtherBoards}
      label={
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CurrentBoardIcon className="h-4 w-4" />
          </span>
          <span className="truncate font-semibold text-foreground text-sm">
            {translateBoardName(board.name)}
          </span>
        </span>
      }
      onChange={(value) => {
        const boardId = Array.isArray(value) ? value[0] : value;
        if (!boardId || boardId === board.id) return;
        router.push(`/${board.ws_id}${tasksHref(`/boards/${boardId}`)}`);
      }}
      options={boardOptions}
      placeholder={translateBoardName(board.name)}
      searchPlaceholder={t.searchBoards}
      selected={board.id}
      showSelectedIcon={false}
    />
  );
}
