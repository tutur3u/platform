'use client';

import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, LayoutList, Pencil } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { getIconComponentByKey } from '../../custom/icon-picker';
import { projectColumns } from './columns';
import { TaskBoardForm } from './form';

interface EnhancedBoardsViewProps {
  wsId: string;
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
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
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

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [boardStatusFilter, setBoardStatusFilter] = useState<
    'all' | 'active' | 'archived' | 'recently_deleted'
  >('active');

  const navigateToBoard = useCallback(
    (boardId: string) => {
      const base = pathname.replace(/\/$/, '');
      router.push(`${base}/${boardId}`);
    },
    [pathname, router]
  );

  const viewStatsByBoardId = useMemo(() => {
    const map = new Map<
      string,
      {
        totalLists: number;
        totalTasks: number;
        hasDeleted: boolean;
        hasArchived: boolean;
      }
    >();
    for (const board of safeData) {
      const lists = board.task_lists || [];
      const totalTasks = lists.reduce(
        (acc: number, list: TaskList & { tasks?: Task[] }) =>
          acc + (list.tasks?.length ?? 0),
        0
      );
      map.set(board.id, {
        totalLists: lists.length,
        totalTasks,
        hasDeleted: Boolean(board.deleted_at),
        hasArchived: Boolean(board.archived_at),
      });
    }
    return map;
  }, [safeData]);

  const { filteredData, hasActiveFilters } = useMemo(() => {
    const hasFilters = searchQuery.trim() !== '' || boardStatusFilter !== 'all';
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
  }, [safeData, searchQuery, sortBy, sortOrder, boardStatusFilter]);

  return (
    <>
      <div className="space-y-6">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <div className="font-medium text-sm">
                {t('ws-task-boards.filters.search_label')}
              </div>
              <Input
                placeholder={t('ws-task-boards.filters.search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 lg:flex lg:items-end">
              <div className="min-w-40">
                <div className="font-medium text-sm">
                  {t('ws-task-boards.filters.status_label')}
                </div>
                <Select
                  value={boardStatusFilter}
                  onValueChange={(value) =>
                    setBoardStatusFilter(value as typeof boardStatusFilter)
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t('ws-task-boards.filters.status.all')}
                    </SelectItem>
                    <SelectItem value="active">
                      {t('ws-task-boards.filters.status.active')}
                    </SelectItem>
                    <SelectItem value="archived">
                      {t('ws-task-boards.filters.status.archived')}
                    </SelectItem>
                    <SelectItem value="recently_deleted">
                      {t('ws-task-boards.filters.status.recently_deleted')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-40">
                <div className="font-medium text-sm">
                  {t('ws-task-boards.filters.sort_label')}
                </div>
                <Select
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">
                      {t('ws-task-boards.filters.sort.name')}
                    </SelectItem>
                    <SelectItem value="created_at">
                      {t('ws-task-boards.filters.sort.created_at')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
                  }
                >
                  {sortOrder === 'asc'
                    ? t('ws-task-boards.filters.sort_order.asc')
                    : t('ws-task-boards.filters.sort_order.desc')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSortBy('name');
                    setSortOrder('asc');
                    setBoardStatusFilter('active');
                  }}
                >
                  {t('common.clear')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="cards" className="mt-2">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="cards" className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4" />
                {t('ws-task-boards.views.cards')}
              </TabsTrigger>
              <TabsTrigger value="table" className="flex items-center gap-2">
                <LayoutList className="h-4 w-4" />
                {t('ws-task-boards.views.table')}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="cards" className="mt-4">
            {filteredData.length === 0 ? (
              <div className="rounded-lg border border-dynamic-border bg-muted/30 p-10 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border bg-background">
                  <LayoutGrid className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="font-semibold">
                  {t('ws-task-boards.empty.title')}
                </div>
                <div className="mt-1 text-muted-foreground text-sm">
                  {t('ws-task-boards.empty.description')}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredData.map((board) => {
                  const stats = viewStatsByBoardId.get(board.id);
                  const totalTasks = stats?.totalTasks ?? 0;
                  const totalLists = stats?.totalLists ?? 0;
                  const BoardIcon =
                    getIconComponentByKey(board.icon) ?? LayoutGrid;
                  return (
                    <div
                      key={board.id}
                      className="group rounded-xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => navigateToBoard(board.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <BoardIcon className="h-4 w-4 text-muted-foreground" />
                            <div className="truncate font-semibold">
                              {board.name || t('common.untitled')}
                            </div>
                          </div>
                          <div className="mt-1 text-muted-foreground text-sm">
                            {totalLists} {t('ws-task-boards.stats.lists')} •{' '}
                            {totalTasks} {t('ws-task-boards.stats.tasks')}
                          </div>
                        </button>

                        <TaskBoardForm wsId={wsId} data={board}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="relative z-10 h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                            aria-label={t('common.edit')}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              // Ensure pointerup/click stays captured by this button
                              // so it can't fall through to the board navigation area.
                              e.currentTarget.setPointerCapture?.(e.pointerId);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TaskBoardForm>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="table" className="mt-4">
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
              onRowClick={(row) => navigateToBoard(row.id)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
