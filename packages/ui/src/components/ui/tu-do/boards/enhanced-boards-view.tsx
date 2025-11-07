'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowRight,
  BarChart3,
  Calendar,
  Copy,
  Eye,
  Filter,
  LayoutGrid,
  LayoutList,
  RefreshCw,
  Settings2,
  SortAsc,
  Trash2,
  X,
} from '@tuturuuu/icons';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { useBoardActions } from '@tuturuuu/ui/hooks/use-board-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { BOARD_RETENTION_DAYS } from '../../../../constants/boards';
import { projectColumns } from './columns';
import { CopyBoardDialog } from './copy-board-dialog';

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
}

// Define types for better type safety
type FilterType = 'all' | 'completed' | 'overdue' | 'urgent';

interface TaskModalState {
  isOpen: boolean;
  filterType: FilterType;
  selectedBoard: string | null; // null means all boards
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

export function EnhancedBoardsView({ wsId }: EnhancedBoardsViewProps) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const q = searchParams.get('q') || '';
  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('pageSize') || '10';

  // Use React Query to consume the hydrated cache
  const { data: queryData } = useQuery({
    queryKey: ['boards', wsId, q, page, pageSize],
    queryFn: () => getBoardsData(wsId, q, page, pageSize),
    // Remove staleTime: 0 to use default behavior
    // This allows React Query to handle staleness based on invalidation
  });

  const data = queryData?.data || [];
  const count = queryData?.count || 0;

  const safeData = useMemo(() => data || [], [data]);
  const {
    softDeleteBoard,
    permanentDeleteBoard,
    restoreBoard,
    archiveBoard,
    unarchiveBoard,
  } = useBoardActions(wsId);

  const [cardLayout, setCardLayout] = useState<CardLayout>('grid-cols-3');
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

  const handleLayoutChange = useCallback(() => {
    const currentIndex = CARD_LAYOUT_OPTIONS.findIndex(
      (opt) => opt.value === cardLayout
    );
    const nextIndex = (currentIndex + 1) % CARD_LAYOUT_OPTIONS.length;
    const nextOption = CARD_LAYOUT_OPTIONS[nextIndex];
    if (nextOption) {
      setCardLayout(nextOption.value);
    }
  }, [cardLayout]);

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

  const refreshTasks = useCallback(() => {
    // Invalidate the boards query to trigger a refetch
    queryClient.invalidateQueries({
      queryKey: ['boards', wsId],
      refetchType: 'active',
    });
  }, [queryClient, wsId]);

  const handleTableFilter = useCallback(() => {
    console.log('Table filter triggered');
  }, []);

  const handleTableSort = useCallback(() => {
    console.log('Table sort triggered');
  }, []);

  const handleTableSettings = useCallback(() => {
    console.log('Table settings triggered');
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
    const hasFilters =
      searchQuery.trim() !== '' ||
      taskModal.filterType !== 'all' ||
      boardStatusFilter !== 'all';
    let filtered = [...safeData];

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
  }, [safeData, searchQuery, sortBy, sortOrder, taskModal, boardStatusFilter]);

  return (
    <>
      <div className="space-y-6">
        <Tabs defaultValue="table" className="w-full">
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-1">
            <div className="flex items-center gap-1">
              <TabsList className="grid grid-cols-3 bg-background shadow-sm">
                <TabsTrigger
                  value="table"
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <LayoutList className="h-4 w-4" />
                  <span className="hidden sm:inline">Table</span>
                </TabsTrigger>
                <TabsTrigger
                  value="cards"
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">Cards</span>
                </TabsTrigger>
                <TabsTrigger
                  value="analytics"
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Analytics</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex items-center gap-1">
              <TabsContent
                value="table"
                className="m-0 data-[state=inactive]:hidden"
              >
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleTableFilter}
                    title="Toggle filters"
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleTableSort}
                    title="Sort"
                  >
                    <SortAsc className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={showColumnSettings ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleTableSettings}
                    title="Table settings"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              <TabsContent
                value="cards"
                className="m-0 data-[state=inactive]:hidden"
              >
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleTableFilter}
                    title="Filter cards"
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleTableSort}
                    title="Sort cards"
                  >
                    <SortAsc className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleLayoutChange}
                    title={`Current: ${cardLayout.split('-')[2]} columns. Click to switch layout.`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              <TabsContent
                value="analytics"
                className="m-0 data-[state=inactive]:hidden"
              >
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground text-xs">
                    Analytics view
                  </span>
                </div>
              </TabsContent>

              <div className="mx-1 h-4 w-px bg-border" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={refreshTasks}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-lg border bg-muted/30 p-4">
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
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
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

          <div className="mt-6">
            <TabsContent value="table" className="mt-0 space-y-4">
              <CustomDataTable
                columnGenerator={projectColumns}
                namespace="basic-data-table"
                data={filteredData}
                count={hasActiveFilters ? filteredData.length : count}
                hideToolbar={true}
                defaultVisibility={{
                  id: false,
                  created_at: false,
                }}
              />
            </TabsContent>

            <TabsContent value="cards" className="mt-0 space-y-4">
              <div
                className={`grid grid-cols-1 gap-6 sm:${cardLayout} lg:${cardLayout}`}
              >
                {filteredData.map((board) => (
                  <div
                    key={board.id}
                    className="group hover:-translate-y-1 relative w-full cursor-pointer rounded-xl border bg-card p-6 text-left shadow-sm transition-all duration-200 hover:border-primary/20 hover:shadow-lg"
                  >
                    <div className="mb-4">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="line-clamp-2 font-semibold text-lg leading-tight transition-colors group-hover:text-primary">
                            {board.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2">
                          {board.archived_at && (
                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground text-xs">
                              Archived
                            </span>
                          )}
                          {board.deleted_at && (
                            <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-1 font-medium text-destructive text-xs">
                              Deleted —{' '}
                              {calculateDaysRemaining(board.deleted_at)} days
                              left
                            </span>
                          )}
                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCopyBoardModal(board);
                              }}
                              title="Copy"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            {board.deleted_at ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    restoreBoard(board.id);
                                  }}
                                  title="Restore board"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    permanentDeleteBoard(board.id);
                                  }}
                                  title="Delete permanently"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            ) : board.archived_at ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  unarchiveBoard(board.id);
                                }}
                                title="Unarchive board"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    archiveBoard(board.id);
                                  }}
                                  title="Archive board"
                                >
                                  <Archive className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    softDeleteBoard(board.id);
                                  }}
                                  title="Delete board"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!board.href) return;
                                window.location.href = board.href;
                              }}
                              title="View board"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t pt-3 text-muted-foreground text-xs">
                      {board.created_at && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {new Date(board.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="font-medium text-primary">
                          View Details
                        </span>
                        <ArrowRight className="h-3 w-3 text-primary" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {safeData.length === 0 && (
                <div className="rounded-lg border-2 border-muted-foreground/25 border-dashed p-12 text-center">
                  <LayoutGrid className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 font-semibold text-lg">
                    No boards found
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Create your first task board to get started.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="analytics" className="mt-0 space-y-4">
              <div className="space-y-6 pb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">
                      Task Timeline & Performance
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {analyticsFilters.selectedBoard
                        ? `Metrics for ${safeData.find((b: WorkspaceTaskBoard) => b.id === analyticsFilters.selectedBoard)?.name || 'Selected Board'}`
                        : 'Aggregate metrics across all boards'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={analyticsFilters.statusFilter}
                      onValueChange={(value) =>
                        setAnalyticsFilters((prev) => ({
                          ...prev,
                          statusFilter: value as
                            | 'all'
                            | 'not_started'
                            | 'active'
                            | 'done'
                            | 'closed',
                        }))
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">📋 All Tasks</SelectItem>
                        <SelectItem value="not_started">
                          ⏸️ Not Started
                        </SelectItem>
                        <SelectItem value="active">🔄 Active</SelectItem>
                        <SelectItem value="done">✅ Done</SelectItem>
                        <SelectItem value="closed">🔒 Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={analyticsFilters.timeView}
                      onValueChange={(value) =>
                        setAnalyticsFilters((prev) => ({
                          ...prev,
                          timeView: value as 'week' | 'month' | 'year',
                        }))
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="week">Week</SelectItem>
                        <SelectItem value="month">Month</SelectItem>
                        <SelectItem value="year">Year</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={analyticsFilters.selectedBoard || 'all'}
                      onValueChange={(value) =>
                        setAnalyticsFilters((prev) => ({
                          ...prev,
                          selectedBoard: value === 'all' ? null : value,
                        }))
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Boards</SelectItem>
                        {safeData.map((board: WorkspaceTaskBoard) => (
                          <SelectItem key={board.id} value={board.id}>
                            {board.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
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
}
