'use client';

import { useQuery } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Activity,
  ChevronDown,
  Clock,
  Filter,
  History,
  LayoutList,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { DataPagination } from '@tuturuuu/ui/custom/data-pagination';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@tuturuuu/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTasksHref } from '@tuturuuu/ui/tu-do/tasks-route-context';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getColumns, type TaskHistoryLogEntry } from './columns';
import LogsTimeline from './logs-timeline';

interface Board {
  id: string;
  name: string | null;
}

interface LogsClientProps {
  wsId: string;
  boards: Board[];
  /** Map of board_id -> estimation_type for proper estimation display */
  estimationTypes: Record<string, string | null>;
}

type ViewMode = 'timeline' | 'table';

const CHANGE_TYPES = [
  'task_created',
  'field_updated',
  'assignee_added',
  'assignee_removed',
  'label_added',
  'label_removed',
  'project_linked',
  'project_unlinked',
] as const;

const FIELD_NAMES = [
  'name',
  'description',
  'priority',
  'end_date',
  'start_date',
  'estimation_points',
  'list_id',
  'completed',
] as const;

export default function LogsClient({
  wsId,
  boards,
  estimationTypes,
}: LogsClientProps) {
  const t = useTranslations('tasks-logs');
  const locale = useLocale();
  const tasksHref = useTasksHref();

  // View state with localStorage persistence
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Load view preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('logs-view-mode');
    if (saved === 'timeline' || saved === 'table') {
      setViewMode(saved);
    }
  }, []);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('logs-view-mode', mode);
  };

  // Filter states
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [boardId, setBoardId] = useState<string>('all');
  const [changeType, setChangeType] = useState<string>('all');
  const [fieldName, setFieldName] = useState<string>('all');

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, []);

  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('pageSize', pageSize.toString());
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (boardId !== 'all') params.set('board_id', boardId);
    if (changeType !== 'all') params.set('change_type', changeType);
    if (fieldName !== 'all') params.set('field_name', fieldName);
    return params.toString();
  }, [page, pageSize, debouncedSearch, boardId, changeType, fieldName]);

  // Fetch data with React Query
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['workspace-task-history', wsId, queryParams],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/history?${queryParams}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch task history');
      }
      return response.json() as Promise<{
        data: TaskHistoryLogEntry[];
        count: number;
        page: number;
        pageSize: number;
      }>;
    },
    staleTime: 30000,
  });

  // Reset page when filters change
  const handleFilterChange = (
    setter: (value: string) => void,
    value: string
  ) => {
    setter(value);
    setPage(1);
  };

  // Clear all filters
  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setBoardId('all');
    setChangeType('all');
    setFieldName('all');
    setPage(1);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (debouncedSearch) count++;
    if (boardId !== 'all') count++;
    if (changeType !== 'all') count++;
    if (fieldName !== 'all') count++;
    return count;
  }, [debouncedSearch, boardId, changeType, fieldName]);

  const hasActiveFilters = activeFilterCount > 0;

  // Table columns
  const columns = useMemo(
    () =>
      getColumns({
        wsId,
        locale,
        t: t as (key: string, options?: { defaultValue?: string }) => string,
        tasksHref,
      }),
    [wsId, locale, t, tasksHref]
  );

  const table = useReactTable({
    data: data?.data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil((data?.count || 0) / pageSize),
  });

  const totalPages = Math.ceil((data?.count || 0) / pageSize);

  // Calculate today's activity count
  const todayCount = useMemo(() => {
    if (!data?.data) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return data.data.filter((entry) => {
      const entryDate = new Date(entry.changed_at);
      entryDate.setHours(0, 0, 0, 0);
      return entryDate.getTime() === today.getTime();
    }).length;
  }, [data?.data]);

  // Filter content component (reused for desktop and mobile)
  const FilterContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3',
        isMobile && 'flex-col items-stretch'
      )}
    >
      {/* Board filter */}
      <Select
        value={boardId}
        onValueChange={(value) => handleFilterChange(setBoardId, value)}
      >
        <SelectTrigger
          className={cn('h-10 text-sm', isMobile ? 'w-full' : 'w-44')}
        >
          <SelectValue
            placeholder={t('filter.board', { defaultValue: 'Board' })}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {t('filter.all_boards', { defaultValue: 'All boards' })}
          </SelectItem>
          {boards.map((board) => (
            <SelectItem key={board.id} value={board.id}>
              {board.name || 'Unnamed Board'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Change type filter */}
      <Select
        value={changeType}
        onValueChange={(value) => handleFilterChange(setChangeType, value)}
      >
        <SelectTrigger
          className={cn('h-10 text-sm', isMobile ? 'w-full' : 'w-44')}
        >
          <SelectValue
            placeholder={t('filter.change_type', {
              defaultValue: 'Change type',
            })}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {t('filter.all_changes', { defaultValue: 'All changes' })}
          </SelectItem>
          {CHANGE_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {t(`change_type.${type}`, { defaultValue: type })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Field name filter (only for field_updated) */}
      <AnimatePresence>
        {changeType === 'field_updated' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={cn(isMobile && 'w-full')}
          >
            <Select
              value={fieldName}
              onValueChange={(value) => handleFilterChange(setFieldName, value)}
            >
              <SelectTrigger
                className={cn('h-10 text-sm', isMobile ? 'w-full' : 'w-44')}
              >
                <SelectValue
                  placeholder={t('filter.field_name', {
                    defaultValue: 'Field',
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('filter.all_fields', {
                    defaultValue: 'All fields',
                  })}
                </SelectItem>
                {FIELD_NAMES.map((field) => (
                  <SelectItem key={field} value={field}>
                    {t(`field_name.${field}`, { defaultValue: field })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clear filters button */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size={isMobile ? 'default' : 'sm'}
          onClick={() => {
            clearFilters();
            if (isMobile) setMobileFiltersOpen(false);
          }}
          className={cn('gap-2', isMobile && 'w-full')}
        >
          <X className="h-4 w-4" />
          {t('clear_filters', { defaultValue: 'Clear all' })}
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header Section - Compact with inline stats */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Title area */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-purple/20 to-dynamic-blue/20">
              <Activity className="h-5 w-5 text-dynamic-purple" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-lg tracking-tight">
                  {t('title', { defaultValue: 'Activity Logs' })}
                </h1>
                {data?.count !== undefined && (
                  <Badge variant="secondary" className="tabular-nums">
                    {data.count.toLocaleString()}
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {t('description', {
                  defaultValue:
                    'Track all changes made to tasks in your workspace',
                })}
              </p>
            </div>
          </div>

          {/* Quick stats inline */}
          <div className="flex items-center gap-3">
            {todayCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-dynamic-green/10 px-2.5 py-1 text-dynamic-green text-xs">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="font-medium">{todayCount}</span>
                <span className="text-dynamic-green/70">
                  {t('today', { defaultValue: 'today' })}
                </span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Controls Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-4 space-y-3"
      >
        {/* Mobile Controls */}
        <div className="flex flex-col gap-3 md:hidden">
          {/* Search - full width on mobile */}
          <div className="relative w-full">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('search_placeholder', {
                defaultValue: 'Search tasks...',
              })}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-11 pr-10 pl-10 text-base"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setDebouncedSearch('');
                  setPage(1);
                }}
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Mobile action bar */}
          <div className="flex items-center gap-2">
            {/* View Toggle - icons only on mobile */}
            <Tabs
              value={viewMode}
              onValueChange={(v) => handleViewModeChange(v as ViewMode)}
              className="flex-1"
            >
              <TabsList className="h-11 w-full p-1">
                <TabsTrigger
                  value="timeline"
                  className="h-9 flex-1 gap-1.5 text-xs"
                >
                  <History className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">
                    {t('timeline_view', { defaultValue: 'Timeline' })}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="table"
                  className="h-9 flex-1 gap-1.5 text-xs"
                >
                  <LayoutList className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">
                    {t('table_view', { defaultValue: 'Table' })}
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Mobile Filter Sheet */}
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger asChild>
                <Button
                  variant={hasActiveFilters ? 'secondary' : 'outline'}
                  size="icon"
                  className="relative h-11 w-11 shrink-0"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  {hasActiveFilters && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full p-0 text-[10px]"
                    >
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-auto max-h-[85vh]">
                <SheetHeader className="mb-4">
                  <SheetTitle className="flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    {t('filters', { defaultValue: 'Filters' })}
                  </SheetTitle>
                  <SheetDescription>
                    {t('filter_description', {
                      defaultValue:
                        'Filter activity logs by board, type, or field',
                    })}
                  </SheetDescription>
                </SheetHeader>
                <FilterContent isMobile />
              </SheetContent>
            </Sheet>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-11 w-11 shrink-0"
            >
              <RefreshCw
                className={cn('h-4 w-4', isFetching && 'animate-spin')}
              />
            </Button>
          </div>
        </div>

        {/* Desktop Controls */}
        <div className="hidden items-center gap-3 md:flex">
          {/* View Toggle */}
          <Tabs
            value={viewMode}
            onValueChange={(v) => handleViewModeChange(v as ViewMode)}
          >
            <TabsList className="h-10 p-1">
              <TabsTrigger value="timeline" className="gap-2 px-4 text-sm">
                <History className="h-4 w-4" />
                {t('timeline_view', { defaultValue: 'Timeline' })}
              </TabsTrigger>
              <TabsTrigger value="table" className="gap-2 px-4 text-sm">
                <LayoutList className="h-4 w-4" />
                {t('table_view', { defaultValue: 'Table' })}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search */}
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('search_placeholder', {
                defaultValue: 'Search tasks...',
              })}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-10 pr-10 pl-10"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setDebouncedSearch('');
                  setPage(1);
                }}
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter Toggle */}
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant={hasActiveFilters ? 'secondary' : 'outline'}
                className="gap-2"
              >
                <Filter className="h-4 w-4" />
                {t('filters', { defaultValue: 'Filters' })}
                {hasActiveFilters && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 w-5 rounded-full p-0 text-[10px]"
                  >
                    {activeFilterCount}
                  </Badge>
                )}
                <ChevronDown
                  className={cn(
                    'ml-0.5 h-4 w-4 transition-transform duration-200',
                    filtersOpen && 'rotate-180'
                  )}
                />
              </Button>
            </CollapsibleTrigger>
          </Collapsible>

          {/* Refresh Button */}
          <Button
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw
              className={cn('h-4 w-4', isFetching && 'animate-spin')}
            />
            {t('refresh', { defaultValue: 'Refresh' })}
          </Button>

          {/* Results count */}
          <div className="ml-auto flex items-center gap-2 text-muted-foreground text-sm">
            {isFetching && !isLoading && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            )}
            {data?.count !== undefined && (
              <span>
                {data.count.toLocaleString()}{' '}
                {t('entries', {
                  defaultValue: data.count === 1 ? 'entry' : 'entries',
                })}
              </span>
            )}
          </div>
        </div>

        {/* Desktop Collapsible Filters */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleContent className="hidden md:block">
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-lg border bg-muted/30 p-4"
            >
              <FilterContent />
            </motion.div>
          </CollapsibleContent>
        </Collapsible>

        {/* Active filter chips - shown when filters closed but active */}
        {hasActiveFilters && !filtersOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="hidden flex-wrap gap-2 md:flex"
          >
            {debouncedSearch && (
              <Badge variant="secondary" className="gap-1 pr-1">
                <Search className="h-3 w-3" />
                &quot;{debouncedSearch}&quot;
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setDebouncedSearch('');
                    setPage(1);
                  }}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {boardId !== 'all' && (
              <Badge variant="secondary" className="gap-1 pr-1">
                {boards.find((b) => b.id === boardId)?.name || 'Board'}
                <button
                  type="button"
                  onClick={() => handleFilterChange(setBoardId, 'all')}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {changeType !== 'all' && (
              <Badge variant="secondary" className="gap-1 pr-1">
                {(
                  t as (
                    key: string,
                    options?: { defaultValue?: string }
                  ) => string
                )(`change_type.${changeType}`, { defaultValue: changeType })}
                <button
                  type="button"
                  onClick={() => {
                    handleFilterChange(setChangeType, 'all');
                    setFieldName('all');
                  }}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {fieldName !== 'all' && (
              <Badge variant="secondary" className="gap-1 pr-1">
                {(
                  t as (
                    key: string,
                    options?: { defaultValue?: string }
                  ) => string
                )(`field_name.${fieldName}`, { defaultValue: fieldName })}
                <button
                  type="button"
                  onClick={() => handleFilterChange(setFieldName, 'all')}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="min-h-0 flex-1"
      >
        {isLoading ? (
          <LoadingSkeleton viewMode={viewMode} />
        ) : error ? (
          <ErrorState
            onRetry={() => refetch()}
            t={
              t as (key: string, options?: { defaultValue?: string }) => string
            }
          />
        ) : !data?.data || data.data.length === 0 ? (
          <EmptyState
            hasActiveFilters={hasActiveFilters}
            onClear={clearFilters}
            t={
              t as (key: string, options?: { defaultValue?: string }) => string
            }
          />
        ) : viewMode === 'timeline' ? (
          <LogsTimeline
            entries={data.data}
            wsId={wsId}
            locale={locale}
            t={
              t as (key: string, options?: { defaultValue?: string }) => string
            }
            estimationTypes={estimationTypes}
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="hover:bg-transparent"
                  >
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="h-12 whitespace-nowrap bg-muted/50 font-medium text-xs"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row, index) => (
                  <motion.tr
                    key={row.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="group border-b transition-colors hover:bg-muted/50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="whitespace-nowrap py-3"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </motion.div>

      {/* Pagination */}
      {data && data.count > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-4"
        >
          <DataPagination
            currentPage={page}
            totalPages={totalPages}
            totalCount={data.count}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            itemName={t('entries', { defaultValue: 'entries' })}
          />
        </motion.div>
      )}
    </div>
  );
}

function LoadingSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === 'timeline') {
    return (
      <div className="space-y-6">
        {[...Array(3)].map((_, groupIndex) => (
          <div key={groupIndex} className="space-y-3">
            {/* Date header skeleton */}
            <div className="flex items-center gap-3 py-2">
              <div className="h-px flex-1 bg-border" />
              <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
              <div className="h-px flex-1 bg-border" />
            </div>
            {/* Entry skeletons */}
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="flex gap-3 rounded-lg border bg-card p-4"
                  style={{ animationDelay: `${(groupIndex * 3 + i) * 100}ms` }}
                >
                  <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                      <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                      <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
                    </div>
                    <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b bg-muted/50 p-4">
        <div className="flex gap-6">
          {[100, 80, 150, 100, 120, 150].map((w, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-muted"
              style={{ width: w, animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
      </div>
      <div className="divide-y">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-6 p-4"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-4 w-36 animate-pulse rounded bg-muted" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

type TranslationFunction = (
  key: string,
  options?: { defaultValue?: string }
) => string;

function ErrorState({
  onRetry,
  t,
}: {
  onRetry: () => void;
  t: TranslationFunction;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex min-h-75 flex-col items-center justify-center rounded-lg border border-dashed bg-card/50 p-8 md:min-h-100"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <X className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">
            {t('error.title', { defaultValue: 'Failed to load activity' })}
          </h3>
          <p className="max-w-sm text-muted-foreground text-sm">
            {t('error.description', {
              defaultValue:
                'Something went wrong while fetching the activity logs.',
            })}
          </p>
        </div>
        <Button onClick={onRetry} variant="outline" className="mt-2 gap-2">
          <RefreshCw className="h-4 w-4" />
          {t('error.retry', { defaultValue: 'Try again' })}
        </Button>
      </div>
    </motion.div>
  );
}

function EmptyState({
  hasActiveFilters,
  onClear,
  t,
}: {
  hasActiveFilters: boolean;
  onClear: () => void;
  t: TranslationFunction;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex min-h-75 flex-col items-center justify-center rounded-lg border border-dashed bg-card/50 p-8 md:min-h-100"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-purple/10 to-dynamic-blue/10">
            {hasActiveFilters ? (
              <Search className="h-9 w-9 text-muted-foreground" />
            ) : (
              <Clock className="h-9 w-9 text-muted-foreground" />
            )}
          </div>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-dynamic-purple/20 to-dynamic-blue/20"
          >
            <Sparkles className="h-4 w-4 text-dynamic-purple" />
          </motion.div>
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">
            {hasActiveFilters
              ? t('empty.no_results', { defaultValue: 'No matching activity' })
              : t('empty.title', { defaultValue: 'No activity yet' })}
          </h3>
          <p className="max-w-sm text-muted-foreground text-sm">
            {hasActiveFilters
              ? t('empty.with_filters', {
                  defaultValue:
                    'Try adjusting your filters to see more results.',
                })
              : t('empty.no_filters', {
                  defaultValue:
                    'Activity will appear here when you start making changes to tasks.',
                })}
          </p>
        </div>
        {hasActiveFilters && (
          <Button onClick={onClear} variant="outline" className="mt-2 gap-2">
            <X className="h-4 w-4" />
            {t('clear_filters', { defaultValue: 'Clear filters' })}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
