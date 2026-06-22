'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  LayoutGrid,
  Trash2,
} from '@tuturuuu/icons';
import {
  getWorkspaceTaskBoard,
  listWorkspaceTaskBoards,
  type WorkspaceTaskBoardDetail,
  type WorkspaceTaskBoardListItem,
} from '@tuturuuu/internal-api/tasks';
import { Badge } from '@tuturuuu/ui/badge';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import {
  getIconComponentByKey,
  type PlatformIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useMemo, useState } from 'react';
import { BoardActivitySettings } from './board-activity-settings';
import { BoardCriticalActionsSettings } from './board-critical-actions-settings';
import { BoardDetailsSettings } from './board-details-settings';
import { BoardEstimationSettings } from './board-estimation-settings';
import { BoardLayoutSettingsSection } from './board-layout-settings-section';

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

type BoardSwitcherItem = Pick<
  WorkspaceTaskBoardListItem,
  'archived_at' | 'deleted_at' | 'icon' | 'id' | 'name'
>;

function getBoardStatus(
  board: Pick<BoardSwitcherItem, 'archived_at' | 'deleted_at'>
) {
  if (board.deleted_at) return 'deleted';
  if (board.archived_at) return 'archived';
  return 'active';
}

function BoardSettingsBoardSwitcher({
  board,
  wsId,
}: {
  board: WorkspaceTaskBoardDetail;
  wsId: string;
}) {
  const t = useTranslations();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [, setSettingsQuery] = useQueryStates(
    {
      settingsBoardId: parseAsString,
    },
    {
      history: 'replace',
      shallow: true,
      scroll: false,
    }
  );
  const { data, isLoading } = useQuery({
    queryKey: ['task-board-settings-switcher', wsId],
    queryFn: () =>
      listWorkspaceTaskBoards(
        wsId,
        { pageSize: 100, status: 'all' },
        getBrowserInternalApiOptions()
      ),
    enabled: Boolean(wsId && switcherOpen),
    staleTime: 60_000,
  });

  const translateBoardName = useCallback(
    (name: string | null | undefined) => {
      if (!name) return t('common.untitled');
      if (name.toLowerCase() === 'tasks') return t('common.tasks');
      return name;
    },
    [t]
  );

  const boardOptions = useMemo(() => {
    const byId = new Map<string, BoardSwitcherItem>();

    for (const item of data?.boards ?? []) {
      byId.set(item.id, item);
    }

    if (!byId.has(board.id)) {
      byId.set(board.id, {
        archived_at: board.archived_at ?? null,
        deleted_at: board.deleted_at ?? null,
        icon: board.icon ?? null,
        id: board.id,
        name: board.name ?? null,
      });
    }

    const groupLabels = {
      active: t('common.active_boards'),
      archived: t('common.archived_boards'),
      deleted: t('common.deleted_boards'),
    };
    const statusLabels = {
      active: t('common.active'),
      archived: t('common.archived'),
      deleted: t('common.deleted'),
    };
    const statusWeight = { active: 0, archived: 1, deleted: 2 };

    return [...byId.values()]
      .sort((a, b) => {
        const aStatus = getBoardStatus(a);
        const bStatus = getBoardStatus(b);
        const statusDelta = statusWeight[aStatus] - statusWeight[bStatus];
        if (statusDelta !== 0) return statusDelta;
        return translateBoardName(a.name).localeCompare(
          translateBoardName(b.name)
        );
      })
      .map((item): ComboboxOption => {
        const BoardIcon =
          getIconComponentByKey(item.icon as PlatformIconKey | null) ??
          LayoutGrid;
        const status = getBoardStatus(item);
        const statusLabel = statusLabels[status];
        const groupLabel = groupLabels[status];

        return {
          value: item.id,
          label: translateBoardName(item.name),
          group: groupLabel,
          searchValue: `${translateBoardName(item.name)} ${statusLabel} ${groupLabel}`,
          description: groupLabel,
          icon: <BoardIcon className="h-4 w-4" />,
          muted: status !== 'active',
          badge: (
            <Badge
              className={cn(
                'shrink-0 gap-1 px-2 py-0.5 text-[10px]',
                status === 'deleted' && 'bg-dynamic-red/10 text-dynamic-red',
                status === 'archived' && 'bg-muted text-foreground',
                status === 'active' && 'bg-dynamic-green/10 text-dynamic-green'
              )}
            >
              {status === 'deleted' ? (
                <Trash2 className="h-3 w-3 text-dynamic-red/50" />
              ) : status === 'archived' ? (
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
    board.archived_at,
    board.deleted_at,
    board.icon,
    board.id,
    board.name,
    data?.boards,
    t,
    translateBoardName,
  ]);

  const selectedBoardName = translateBoardName(board.name);
  const CurrentBoardIcon =
    getIconComponentByKey(board.icon as PlatformIconKey | null) ?? LayoutGrid;
  const currentStatus = getBoardStatus(board);
  const statusLabel =
    currentStatus === 'deleted'
      ? t('common.deleted')
      : currentStatus === 'archived'
        ? t('common.archived')
        : t('common.active');

  return (
    <div className="rounded-lg border bg-background p-2.5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/30">
            <CurrentBoardIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate font-medium text-sm">
                {selectedBoardName}
              </p>
              <Badge
                className={cn(
                  'shrink-0 px-2 py-0.5 text-[10px]',
                  currentStatus === 'deleted' &&
                    'bg-dynamic-red/10 text-dynamic-red',
                  currentStatus === 'archived' && 'bg-muted text-foreground',
                  currentStatus === 'active' &&
                    'bg-dynamic-green/10 text-dynamic-green'
                )}
              >
                {statusLabel}
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              {t('settings.tasks.board')}
            </p>
          </div>
        </div>

        <Combobox
          ariaLabel={t('common.search_boards')}
          className="w-full md:w-80"
          contentWidth="lg"
          disabled={isLoading}
          emptyText={
            isLoading ? t('common.loading') : t('common.no_other_boards')
          }
          label={
            <span className="truncate text-left font-medium text-sm">
              {selectedBoardName}
            </span>
          }
          onChange={(value) => {
            const nextBoardId = Array.isArray(value) ? value[0] : value;
            if (!nextBoardId || nextBoardId === board.id) return;
            void setSettingsQuery({ settingsBoardId: nextBoardId });
          }}
          onOpenChange={setSwitcherOpen}
          options={boardOptions}
          placeholder={selectedBoardName}
          searchPlaceholder={t('common.search_boards')}
          selected={board.id}
        />
      </div>
    </div>
  );
}

function BoardSettingsLoadingState() {
  return (
    <div className="space-y-4" data-testid="board-settings-loading-state">
      <div className="rounded-lg border bg-background p-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-md bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="hidden h-9 w-64 animate-pulse rounded-md bg-muted md:block" />
        </div>
      </div>
      <div className="h-10 animate-pulse rounded-md bg-muted" />
      <div className="rounded-lg border bg-background p-4">
        <div className="space-y-3">
          <div className="h-5 w-28 animate-pulse rounded bg-muted" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded bg-muted" />
          <div className="grid gap-4 pt-2 md:grid-cols-[8rem_minmax(0,1fr)]">
            <div className="h-16 animate-pulse rounded-md bg-muted" />
            <div className="h-16 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function BoardSettingsPanel({
  boardId,
  wsId,
}: {
  boardId: string;
  wsId: string;
}) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<
    'actions' | 'activity' | 'details' | 'estimation' | 'layout'
  >('details');

  const {
    data: board,
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['task-board-settings', wsId, boardId],
    queryFn: async () => {
      const payload = await getWorkspaceTaskBoard(
        wsId,
        boardId,
        getBrowserInternalApiOptions()
      );
      return payload.board;
    },
    enabled: Boolean(wsId && boardId),
    staleTime: 30_000,
  });

  if (isLoading) {
    return <BoardSettingsLoadingState />;
  }

  if (error || !board) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
        <div>
          <p className="font-medium text-destructive">
            {t('settings.tasks.board_load_failed')}
          </p>
          <p className="text-muted-foreground">
            {error instanceof Error
              ? error.message
              : t('settings.tasks.board_load_failed_description')}
          </p>
        </div>
      </div>
    );
  }

  const refreshBoard = () => {
    void refetch();
  };

  return (
    <div className="space-y-4">
      <BoardSettingsBoardSwitcher board={board} wsId={wsId} />

      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(
            value as
              | 'actions'
              | 'activity'
              | 'details'
              | 'estimation'
              | 'layout'
          )
        }
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="details">
            {t('settings.tasks.board_details')}
          </TabsTrigger>
          <TabsTrigger value="layout">
            {t('settings.tasks.board_layout')}
          </TabsTrigger>
          <TabsTrigger value="estimation">
            {t('settings.tasks.estimates')}
          </TabsTrigger>
          <TabsTrigger value="activity">
            {t('settings.tasks.board_activity')}
          </TabsTrigger>
          <TabsTrigger value="actions">
            {t('settings.tasks.board_actions')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          {activeTab === 'details' && (
            <BoardDetailsSettings
              board={board}
              onRefresh={refreshBoard}
              wsId={wsId}
            />
          )}
        </TabsContent>
        <TabsContent value="layout">
          {activeTab === 'layout' && (
            <BoardLayoutSettingsSection
              board={board}
              onRefresh={refreshBoard}
              wsId={wsId}
            />
          )}
        </TabsContent>
        <TabsContent value="estimation">
          {activeTab === 'estimation' && (
            <BoardEstimationSettings
              board={board}
              onRefresh={refreshBoard}
              wsId={wsId}
            />
          )}
        </TabsContent>
        <TabsContent value="activity">
          {activeTab === 'activity' && (
            <BoardActivitySettings
              boardId={board.id}
              taskLists={board.task_lists ?? []}
              wsId={wsId}
            />
          )}
        </TabsContent>
        <TabsContent value="actions">
          {activeTab === 'actions' && (
            <BoardCriticalActionsSettings
              board={board}
              onRefresh={refreshBoard}
              wsId={wsId}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
