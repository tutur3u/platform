'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarPlus, PartyPopper, RotateCcw, Search } from '@tuturuuu/icons';
import type { TutoringQueueItem } from '@tuturuuu/internal-api';
import { listTutoringQueue } from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import type { ColumnDef } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { TutoringReasonBadge } from './tutoring-badges';
import { WorkspacePersonPicker } from './tutoring-people-picker';

interface TutoringQueueFilters {
  groupId: string;
  reasonType: string;
  search: string;
  studentUserId: string;
}

interface TutoringQueueActions {
  onGroupIdChange: (value: string) => void;
  onParamsChange: (params: { page?: number; pageSize?: string }) => void;
  onReasonTypeChange: (value: string) => void;
  onResetFilters: () => void;
  onSchedule: (item: TutoringQueueItem) => void;
  onSearchChange: (value: string) => void;
  onStudentUserIdChange: (value: string) => void;
}

interface Props {
  actions: TutoringQueueActions;
  canManage: boolean;
  enabled: boolean;
  filters: TutoringQueueFilters;
  groups: UserGroup[];
  pagination: { page: number; pageSize: number };
  wsId: string;
}

const REASON_FILTERS = ['all', 'ABSENT_RECOVERY', 'WEAK_SUPPORT', 'BOTH'];

function QueueEmptyState({ isFiltered }: { isFiltered: boolean }) {
  const t = useTranslations('ws-tutoring');

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green">
        <PartyPopper className="h-6 w-6" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">
          {isFiltered ? t('no_queue_filtered') : t('no_queue')}
        </p>
        <p className="mx-auto max-w-sm text-muted-foreground text-sm">
          {isFiltered
            ? t('no_queue_filtered_description')
            : t('no_queue_description')}
        </p>
      </div>
    </div>
  );
}

export function TutoringQueueCard({
  actions,
  canManage,
  enabled,
  filters,
  groups,
  pagination,
  wsId,
}: Props) {
  const t = useTranslations('ws-tutoring');
  const tCommon = useTranslations();

  const queueQuery = useQuery({
    enabled,
    placeholderData: keepPreviousData,
    queryKey: [
      'tutoring-queue',
      wsId,
      filters.reasonType,
      filters.groupId,
      filters.studentUserId,
      filters.search,
      pagination.page,
      pagination.pageSize,
    ],
    queryFn: () =>
      listTutoringQueue(wsId, {
        groupId: filters.groupId === 'all' ? undefined : filters.groupId,
        page: pagination.page,
        pageSize: pagination.pageSize,
        q: filters.search.trim() || undefined,
        reasonType:
          filters.reasonType === 'all' ? undefined : filters.reasonType,
        studentUserId:
          filters.studentUserId === 'all' ? undefined : filters.studentUserId,
      }),
  });

  const summary = queueQuery.data?.summary ?? { absent: 0, weak: 0 };
  const isFiltered =
    filters.search.trim().length > 0 ||
    filters.reasonType !== 'all' ||
    filters.groupId !== 'all' ||
    filters.studentUserId !== 'all';

  const groupOptions = useMemo<ComboboxOption[]>(
    () => [
      { label: t('all_groups'), value: 'all' },
      ...groups.map((group) => ({
        label: group.name || group.id,
        value: group.id,
      })),
    ],
    [groups, t]
  );

  const reasonLabels: Record<string, string> = {
    all: t('all_reasons'),
    ABSENT_RECOVERY: t('absent_recovery'),
    BOTH: t('both_reason'),
    WEAK_SUPPORT: t('weak_support'),
  };

  const columns = ({ t: tableT }: { t: ReturnType<typeof useTranslations> }) =>
    [
      {
        // Server-paginated: client-side sorting would only reorder this page.
        enableSorting: false,
        id: 'student_name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            t={tableT}
            title={t('student')}
          />
        ),
        cell: ({ row }) => (
          <div className="min-w-40">
            <p className="font-medium">{row.original.student_name || '-'}</p>
            <p className="truncate text-muted-foreground text-xs">
              {row.original.group_name || '-'}
            </p>
          </div>
        ),
      },
      {
        enableSorting: false,
        accessorKey: 'reason_type',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            t={tableT}
            title={t('reason')}
          />
        ),
        cell: ({ row }) => (
          <TutoringReasonBadge reason={row.original.reason_type} />
        ),
      },
      {
        enableSorting: false,
        accessorKey: 'absence_deficit',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            t={tableT}
            title={t('deficit_label')}
          />
        ),
        cell: ({ row }) =>
          row.original.absence_deficit > 0 ? (
            <Badge
              className="rounded-full border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange"
              variant="outline"
            >
              {t('deficit_sessions', { count: row.original.absence_deficit })}
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        enableSorting: false,
        accessorKey: 'feedback_content',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            t={tableT}
            title={t('feedback')}
          />
        ),
        cell: ({ row }) => (
          <p className="line-clamp-2 max-w-80 text-sm">
            {row.original.feedback_content || '-'}
          </p>
        ),
      },
      {
        id: 'actions',
        header: () => <div className="text-right">{t('actions')}</div>,
        cell: ({ row }) =>
          canManage ? (
            <div className="flex justify-end">
              <Button
                onClick={() => actions.onSchedule(row.original)}
                size="sm"
              >
                <CalendarPlus className="h-4 w-4" />
                {t('schedule_support')}
              </Button>
            </div>
          ) : null,
      },
    ] satisfies ColumnDef<TutoringQueueItem>[];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-lg tracking-tight">
            {t('queue_title_plain')}
          </h3>
          <p className="text-muted-foreground text-sm">
            {t('queue_description')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className="rounded-full border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange"
            variant="outline"
          >
            {t('queue_absent_count', { count: summary.absent })}
          </Badge>
          <Badge
            className="rounded-full border-dynamic-sky/25 bg-dynamic-sky/10 text-dynamic-sky"
            variant="outline"
          >
            {t('queue_weak_count', { count: summary.weak })}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <div className="relative w-full sm:w-56">
          <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            onChange={(event) =>
              actions.onSearchChange(event.currentTarget.value)
            }
            placeholder={t('search_queue')}
            value={filters.search}
          />
        </div>

        <Combobox
          className="w-full sm:w-44"
          emptyText={t('no_reasons')}
          onChange={(value) => actions.onReasonTypeChange(value as string)}
          options={REASON_FILTERS.map((reason) => ({
            label: reasonLabels[reason] ?? reason,
            value: reason,
          }))}
          placeholder={t('all_reasons')}
          searchPlaceholder={t('reason')}
          selected={filters.reasonType}
        />

        <Combobox
          className="w-full sm:w-52"
          emptyText={t('no_groups')}
          onChange={(value) => actions.onGroupIdChange(value as string)}
          options={groupOptions}
          placeholder={t('all_groups')}
          searchPlaceholder={t('search_groups')}
          selected={filters.groupId}
        />

        <WorkspacePersonPicker
          className="w-full sm:w-52"
          emptyText={t('no_students')}
          extraOptions={[{ label: t('all_students'), value: 'all' }]}
          onChange={actions.onStudentUserIdChange}
          placeholder={t('all_students')}
          searchPlaceholder={t('search_students')}
          value={filters.studentUserId}
          wsId={wsId}
        />

        {isFiltered ? (
          <Button
            className="ml-auto"
            onClick={actions.onResetFilters}
            size="sm"
            variant="ghost"
          >
            <RotateCcw className="h-4 w-4" />
            {t('reset_filters')}
          </Button>
        ) : null}
      </div>

      <DataTable
        columnGenerator={columns}
        count={queueQuery.data?.count ?? 0}
        data={queueQuery.isLoading ? undefined : queueQuery.data?.data}
        disableSearch
        emptyState={<QueueEmptyState isFiltered={isFiltered} />}
        hideToolbar
        namespace="tutoring-queue-table"
        pageIndex={(queueQuery.data?.page ?? pagination.page) - 1}
        pageSize={queueQuery.data?.pageSize ?? pagination.pageSize}
        setParams={actions.onParamsChange}
        t={tCommon}
      />
    </section>
  );
}
