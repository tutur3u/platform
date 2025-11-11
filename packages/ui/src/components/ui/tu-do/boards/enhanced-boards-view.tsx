'use client';

import { useQuery } from '@tanstack/react-query';
import { X } from '@tuturuuu/icons';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { useBoardActions } from '@tuturuuu/ui/hooks/use-board-actions';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BOARD_RETENTION_DAYS } from '../../../../constants/boards';
import { BoardViews } from './board-views';
import { CopyBoardDialog } from './copy-board-dialog';

interface WorkspaceInfo {
  id: string;
  name: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  personal: boolean;
  created_at: string | null;
}

interface AnalyticsFilters {
  timeView: 'week' | 'month' | 'year';
  selectedBoard: string | null;
  statusFilter: 'all' | 'not_started' | 'active' | 'done' | 'closed';
}

const CARD_LAYOUT_OPTIONS = [
  { label: 'Grid (1 column)', value: 'grid-cols-1' },
  { label: 'Grid (2 columns)', value: 'grid-cols-2' },
  { label: 'Grid (3 columns)', value: 'grid-cols-3' },
] as const;

type CardLayout = (typeof CARD_LAYOUT_OPTIONS)[number]['value'];

interface EnhancedBoardsViewProps {
  wsId: string;
  wsIds?: string[];
  isPersonal?: boolean;
  workspaces?: WorkspaceInfo[];
  onSelectedWorkspaceChange?: (wsId: string | null) => void;
}

type FilterType = 'all' | 'completed' | 'overdue' | 'urgent';

interface TaskModalState {
  isOpen: boolean;
  filterType: FilterType;
  selectedBoard: string | null;
}

async function getBoardsData(
  wsId: string,
  q: string,
  page: string,
  pageSize: string
) {
  const response = await fetch(
    `/api/v1/workspaces/${wsId}/boards-data?q=${q}&page=${page}&pageSize=${pageSize}`,
    { cache: 'no-store' }
  );
  if (!response.ok) {
    throw new Error('Failed to fetch boards data');
  }
  return response.json();
}

async function getAllBoardsData(
  wsIds: string[],
  q: string,
  page: string,
  pageSize: string
) {
  const response = await fetch(
    `/api/v1/all-boards-data?wsIds=${wsIds.join(
      ','
    )}&q=${q}&page=${page}&pageSize=${pageSize}`,
    { cache: 'no-store' }
  );
  if (!response.ok) {
    throw new Error('Failed to fetch all boards data');
  }
  return response.json();
}

export function EnhancedBoardsView({
  wsId,
  wsIds,
  isPersonal,
  workspaces,
  onSelectedWorkspaceChange,
}: EnhancedBoardsViewProps) {
  const searchParams = useSearchParams();

  const q = searchParams.get('q') || '';
  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('pageSize') || '10';

  const personalWs = useMemo(
    () => workspaces?.find((ws) => ws.personal),
    [workspaces]
  );

  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(
    personalWs?.id || workspaces?.[0]?.id || null
  );

  useEffect(() => {
    onSelectedWorkspaceChange?.(selectedWorkspace);
  }, [selectedWorkspace, onSelectedWorkspaceChange]);

  const queryKey = isPersonal
    ? ['all-boards', wsIds, q, page, pageSize]
    : ['boards', wsId, q, page, pageSize];

  const queryFn = isPersonal
    ? () => getAllBoardsData(wsIds || [], q, page, pageSize)
    : () => getBoardsData(wsId, q, page, pageSize);

  const { data: queryData } = useQuery({
    queryKey,
    queryFn,
  });

  const data = queryData?.data || [];
  const count = queryData?.count || 0;

  const safeData = useMemo(() => data || [], [data]);
  const keyForInvalidation = isPersonal ? ['all-boards'] : ['boards', wsId];

  const {
    softDeleteBoard,
    permanentDeleteBoard,
    restoreBoard,
    archiveBoard,
    unarchiveBoard,
  } = useBoardActions(keyForInvalidation);

  const cardLayout: CardLayout = 'grid-cols-3';
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [boardStatusFilter, setBoardStatusFilter] = useState<
    'all' | 'active' | 'archived' | 'recently_deleted'
  >('active');

  const [columnVisibility, setColumnVisibility] = useState({
    boardName: true,
    totalTasks: true,
    progress: true,
    completedTasks: true,
    activeTasks: true,
    overdueTasks: true,
    createdDate: false,
    lastUpdated: false,
    priorityDistribution: true,
  });

  const resetColumnVisibility = useCallback(() => {
    setColumnVisibility({
      boardName: true,
      totalTasks: true,
      progress: true,
      completedTasks: true,
      activeTasks: true,
      overdueTasks: true,
      createdDate: false,
      lastUpdated: false,
      priorityDistribution: true,
    });
  }, []);

  const [taskModal, setTaskModal] = useState<TaskModalState>({
    isOpen: false,
    filterType: 'all',
    selectedBoard: null,
  });

  const [copyBoardModal, setCopyBoardModal] = useState<{
    isOpen: boolean;
    board: WorkspaceTaskBoard | null;
  }>({
    isOpen: false,
    board: null,
  });

  const [analyticsFilters, setAnalyticsFilters] = useState<AnalyticsFilters>({
    timeView: 'week',
    selectedBoard: null,
    statusFilter: 'all',
  });

  const openCopyBoardModal = useCallback((board: WorkspaceTaskBoard) => {
    setCopyBoardModal({ isOpen: true, board });
  }, []);

  const closeCopyBoardModal = useCallback(() => {
    setCopyBoardModal({ isOpen: false, board: null });
  }, []);

  const calculateDaysRemaining = useCallback((deletedAt: string | null) => {
    if (!deletedAt) return null;

    const deletedDate = new Date(deletedAt);
    const now = new Date();
    const daysPassed = Math.floor(
      (now.getTime() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysRemaining = (BOARD_RETENTION_DAYS ?? 30) - daysPassed;

    return Math.max(0, daysRemaining);
  }, []);

  const { filteredData, hasActiveFilters } = useMemo(() => {
    let filtered = [...safeData];

    if (isPersonal && selectedWorkspace) {
      filtered = filtered.filter((board) => board.ws_id === selectedWorkspace);
    }

    const hasFilters =
      searchQuery.trim() !== '' ||
      taskModal.filterType !== 'all' ||
      boardStatusFilter !== 'all';

    if (boardStatusFilter !== 'all') {
      filtered = filtered.filter((board) => {
        switch (boardStatusFilter) {
          case 'active':
            return !board.deleted_at && !board.archived_at;
          case 'archived':
            return board.archived_at && !board.deleted_at;
          case 'recently_deleted':
            return !!board.deleted_at;
          default:
            return true;
        }
      });
    }

    if (searchQuery.trim()) {
      filtered = filtered.filter((board) =>
        board.name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    filtered.sort((a, b) => {
      let aValue: string | number, bValue: string | number;

      switch (sortBy) {
        case 'name':
          aValue = a.name?.toLowerCase() || '';
          bValue = b.name?.toLowerCase() || '';
          break;
        case 'created_at':
          aValue = new Date(a.created_at || 0).getTime();
          bValue = new Date(b.created_at || 0).getTime();
          break;
        default:
          aValue = a.name?.toLowerCase() || '';
          bValue = b.name?.toLowerCase() || '';
      }

      if (sortOrder === 'desc') {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      } else {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      }
    });

    return { filteredData: filtered, hasActiveFilters: hasFilters };
  }, [
    safeData,
    searchQuery,
    sortBy,
    sortOrder,
    taskModal,
    boardStatusFilter,
    isPersonal,
    selectedWorkspace,
  ]);

  const MainContent = ({
    isPersonalContent,
  }: {
    isPersonalContent?: boolean;
  }) => (
    <>
      <div className="space-y-6">
        <Tabs defaultValue="table" className="w-full">
          <div
            className={`${
              isPersonalContent
                ? 'rounded-tl-lg rounded-tr-lg rounded-br-lg rounded-bl-lg bg-foreground/[0.025] dark:bg-foreground/5'
                : 'rounded-lg bg-transparent'
            }`}
          >
            <div
              className={`p-4 ${isPersonalContent ? 'rounded-tl-lg rounded-tr-lg rounded-br-lg rounded-bl-lg' : 'rounded-lg'}`}
            >
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label htmlFor="board-search" className="font-medium text-sm">
                    Search
                  </label>
                  <input
                    type="text"
                    placeholder="Search boards..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="mt-1 w-full rounded-md bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="w-40">
                  <label htmlFor="board-status" className="font-medium text-sm">
                    Status
                  </label>
                  <select
                    value={boardStatusFilter}
                    onChange={(e) =>
                      setBoardStatusFilter(
                        e.target.value as typeof boardStatusFilter
                      )
                    }
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="all">All Boards</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="recently_deleted">Recently Deleted</option>
                  </select>
                </div>
                <div className="w-32">
                  <label htmlFor="board-sort" className="font-medium text-sm">
                    Sort By
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="name">Name</option>
                    <option value="created_at">Created</option>
                    <option value="totalTasks">Tasks</option>
                    <option value="progressPercentage">Progress</option>
                  </select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSortBy('name');
                    setSortOrder('asc');
                    setBoardStatusFilter('all');
                    setTaskModal({ ...taskModal, filterType: 'all' });
                  }}
                  className="mt-6"
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>

          {showColumnSettings && (
            <div className="mt-4 rounded-lg border bg-muted/30 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-medium text-sm">Column Settings</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowColumnSettings(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.boardName}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          boardName: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Board Name</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.totalTasks}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          totalTasks: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Total Tasks</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.progress}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          progress: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Progress</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.completedTasks}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          completedTasks: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Completed Tasks</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.activeTasks}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          activeTasks: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Active Tasks</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.overdueTasks}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          overdueTasks: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Overdue Tasks</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.createdDate}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          createdDate: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Created Date</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.lastUpdated}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          lastUpdated: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Last Updated</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.priorityDistribution}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          priorityDistribution: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Priority Distribution</span>
                  </label>
                </div>
                <div className="flex items-center gap-2 border-t pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetColumnVisibility}
                  >
                    Reset to Default
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowColumnSettings(false)}
                  >
                    Apply Changes
                  </Button>
                </div>
              </div>
            </div>
          )}

          <BoardViews
            filteredData={filteredData}
            count={count}
            hasActiveFilters={hasActiveFilters}
            isPersonal={isPersonal}
            wsId={wsId}
            cardLayout={cardLayout}
            openCopyBoardModal={openCopyBoardModal}
            restoreBoard={restoreBoard}
            permanentDeleteBoard={permanentDeleteBoard}
            unarchiveBoard={unarchiveBoard}
            archiveBoard={archiveBoard}
            softDeleteBoard={softDeleteBoard}
            calculateDaysRemaining={calculateDaysRemaining}
            analyticsFilters={analyticsFilters}
            setAnalyticsFilters={setAnalyticsFilters}
            safeData={safeData}
          />
        </Tabs>
      </div>

      {copyBoardModal.board && (
        <CopyBoardDialog
          board={copyBoardModal.board}
          open={copyBoardModal.isOpen}
          onOpenChange={closeCopyBoardModal}
        />
      )}
    </>
  );

  if (isPersonal) {
    return (
      <div className="mx-auto w-full">
        <Tabs
          value={selectedWorkspace ?? ''}
          onValueChange={setSelectedWorkspace}
          className="w-full"
        >
          <div className="w-full overflow-hidden">
            <TabsList className="flex h-auto w-full items-start overflow-x-auto rounded-none border-0 bg-transparent p-0 pr-8">
              <div className="hidden flex-none items-start px-4 py-2.5 text-muted-foreground text-sm md:flex">
                Workspaces
              </div>
              <div className="flex min-w-0 flex-1 gap-0">
                {workspaces?.map((ws) => (
                  <TabsTrigger
                    key={ws.id}
                    value={ws.id}
                    className='before:-translate-y-1/2 relative flex h-auto min-w-[60px] max-w-[240px] flex-1 items-center justify-start gap-2 rounded-tl-lg rounded-tr-lg rounded-br-none rounded-bl-none border-0 px-4 py-2.5 text-left shadow-none outline-none ring-0 transition-all before:absolute before:top-1/2 before:right-0 before:h-4 before:w-[1.5px] before:bg-border before:transition-opacity before:content-[""] last:before:hidden hover:bg-foreground/[0.015] hover:before:opacity-0 focus-visible:outline-none focus-visible:ring-0 has-[+[data-state=active]]:before:hidden has-[:hover]:before:opacity-0 data-[state=active]:bg-foreground/[0.025] data-[state=active]:font-medium data-[state=active]:shadow-none data-[state=active]:hover:bg-foreground/[0.025] data-[state=active]:before:hidden data-[state=active]:dark:bg-foreground/5 hover:dark:bg-foreground/[0.025] data-[state=active]:hover:dark:bg-foreground/5'
                  >
                    <Avatar className="h-5 w-5 flex-none">
                      <AvatarImage
                        src={
                          ws.avatar_url ||
                          `https://avatar.vercel.sh/${ws.name}.png`
                        }
                        alt={ws.name || 'Workspace'}
                      />
                      <AvatarFallback className="text-xs">
                        {ws.name ? getInitials(ws.name) : '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{ws.name}</span>
                  </TabsTrigger>
                ))}
              </div>
            </TabsList>
          </div>
        </Tabs>
        <div className="rounded-tl-none rounded-tr-lg rounded-br-lg rounded-bl-lg">
          <MainContent isPersonalContent={true} />
        </div>
      </div>
    );
  }

  return <MainContent />;
}
