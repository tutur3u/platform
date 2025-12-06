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
  Sparkles,
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
import { Separator } from '@tuturuuu/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { getColumns, type TaskHistoryLogEntry } from './columns';
import LogsTimeline from './logs-timeline';

interface Board {
  id: string;
  name: string;
}

interface LogsClientProps {
  wsId: string;
  boards: Board[];
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

export default function LogsClient({ wsId, boards }: LogsClientProps) {
  const t = useTranslations('tasks-logs');
  const locale = useLocale();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    () => getColumns({ wsId, locale, t }),
    [wsId, locale, t]
  );

  const table = useReactTable({
    data: data?.data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil((data?.count || 0) / pageSize),
  });

  const totalPages = Math.ceil((data?.count || 0) / pageSize);

  return (
    <div className="flex h-full flex-col">
      {/* Header Section */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 space-y-1"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-dynamic-purple/20 to-dynamic-blue/20">
            <Activity className="h-5 w-5 text-dynamic-purple" />
          </div>
          <div>
            <h1 className="font-semibold text-xl tracking-tight">
              {t('title', { defaultValue: 'Activity Logs' })}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t('description', {
                defaultValue:
                  'Track all changes made to tasks in your workspace',
              })}
            </p>
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
        {/* Main Controls Row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View Toggle */}
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as ViewMode)}
          >
            <TabsList className="h-9 p-1">
              <TabsTrigger value="timeline" className="gap-1.5 px-3 text-xs">
                <History className="h-3.5 w-3.5" />
                {t('timeline_view', { defaultValue: 'Timeline' })}
              </TabsTrigger>
              <TabsTrigger value="table" className="gap-1.5 px-3 text-xs">
                <LayoutList className="h-3.5 w-3.5" />
                {t('table_view', { defaultValue: 'Table' })}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Separator orientation="vertical" className="h-6" />

          {/* Search */}
          <div className="relative min-w-[200px] flex-1 md:max-w-xs">
            <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t('search_placeholder', {
                defaultValue: 'Search tasks...',
              })}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-9 pl-8 text-sm"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  setDebouncedSearch('');
                  setPage(1);
                }}
                className="-translate-y-1/2 absolute top-1/2 right-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Toggle */}
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant={hasActiveFilters ? 'secondary' : 'outline'}
                size="sm"
                className="gap-1.5"
              >
                <Filter className="h-3.5 w-3.5" />
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
                    'ml-0.5 h-3.5 w-3.5 transition-transform duration-200',
                    filtersOpen && 'rotate-180'
                  )}
                />
              </Button>
            </CollapsibleTrigger>
          </Collapsible>

          {/* Refresh Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')}
            />
            <span className="hidden sm:inline">
              {t('refresh', { defaultValue: 'Refresh' })}
            </span>
          </Button>

          {/* Results count */}
          <div className="ml-auto flex items-center gap-2 text-muted-foreground text-xs">
            {isFetching && !isLoading && (
              <RefreshCw className="h-3 w-3 animate-spin" />
            )}
            {data?.count !== undefined && (
              <span>
                {data.count.toLocaleString()}{' '}
                {t('results', {
                  defaultValue: data.count === 1 ? 'entry' : 'entries',
                })}
              </span>
            )}
          </div>
        </div>

        {/* Collapsible Filters */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleContent>
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3"
            >
              {/* Board filter */}
              <Select
                value={boardId}
                onValueChange={(value) => handleFilterChange(setBoardId, value)}
              >
                <SelectTrigger className="h-8 w-[160px] text-xs">
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
                      {board.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Change type filter */}
              <Select
                value={changeType}
                onValueChange={(value) =>
                  handleFilterChange(setChangeType, value)
                }
              >
                <SelectTrigger className="h-8 w-[160px] text-xs">
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
                  >
                    <Select
                      value={fieldName}
                      onValueChange={(value) =>
                        handleFilterChange(setFieldName, value)
                      }
                    >
                      <SelectTrigger className="h-8 w-[160px] text-xs">
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
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 gap-1 text-xs"
                >
                  <X className="h-3 w-3" />
                  {t('clear_filters', { defaultValue: 'Clear all' })}
                </Button>
              )}
            </motion.div>
          </CollapsibleContent>
        </Collapsible>
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
          <ErrorState onRetry={() => refetch()} t={t} />
        ) : !data?.data || data.data.length === 0 ? (
          <EmptyState
            hasActiveFilters={hasActiveFilters}
            onClear={clearFilters}
            t={t}
          />
        ) : viewMode === 'timeline' ? (
          <LogsTimeline entries={data.data} wsId={wsId} locale={locale} t={t} />
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
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
                        className="h-10 bg-muted/50 text-xs font-medium"
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
                      <TableCell key={cell.id} className="py-3">
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
        {[...Array(4)].map((_, groupIndex) => (
          <div key={groupIndex} className="space-y-3">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="flex gap-3 rounded-lg border bg-card p-4"
                >
                  <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
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
      <div className="border-b bg-muted/50 p-3">
        <div className="flex gap-4">
          {[80, 100, 150, 100, 120].map((w, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-muted"
              style={{ width: w }}
            />
          ))}
        </div>
      </div>
      <div className="divide-y">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorState({
  onRetry,
  t,
}: {
  onRetry: () => void;
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex h-[400px] flex-col items-center justify-center rounded-lg border border-dashed bg-card/50"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <X className="h-7 w-7 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="font-medium">
            {t('error.title', { defaultValue: 'Failed to load activity' })}
          </h3>
          <p className="max-w-sm text-muted-foreground text-sm">
            {t('error.description', {
              defaultValue:
                'Something went wrong while fetching the activity logs.',
            })}
          </p>
        </div>
        <Button onClick={onRetry} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
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
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex h-[400px] flex-col items-center justify-center rounded-lg border border-dashed bg-card/50"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-dynamic-purple/10 to-dynamic-blue/10">
            {hasActiveFilters ? (
              <Search className="h-7 w-7 text-muted-foreground" />
            ) : (
              <Clock className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-dynamic-purple/20">
            <Sparkles className="h-3.5 w-3.5 text-dynamic-purple" />
          </div>
        </div>
        <div className="space-y-1">
          <h3 className="font-medium">
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
          <Button
            onClick={onClear}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <X className="h-3.5 w-3.5" />
            {t('clear_filters', { defaultValue: 'Clear filters' })}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
