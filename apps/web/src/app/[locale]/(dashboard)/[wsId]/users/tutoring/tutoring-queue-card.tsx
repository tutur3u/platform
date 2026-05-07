'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Loader2 } from '@tuturuuu/icons';
import type {
  TutoringQueueItem,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { getDisplayName, queueSummary } from './tutoring-types';

interface Props {
  canManage: boolean;
  groups: UserGroup[];
  students: WorkspaceBasicUserRecord[];
  reasonType: string;
  groupId: string;
  studentUserId: string;
  search: string;
  onGroupSearchChange: (value: string) => void;
  onStudentSearchChange: (value: string) => void;
  groupHasMore: boolean;
  studentHasMore: boolean;
  groupsLoadingMore: boolean;
  studentsLoadingMore: boolean;
  onLoadMoreGroups: () => void;
  onLoadMoreStudents: () => void;
  isFetching: boolean;
  count: number;
  page: number;
  pageSize: number;
  onReasonTypeChange: (value: string) => void;
  onGroupIdChange: (value: string) => void;
  onStudentUserIdChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onParamsChange: (params: { page?: number; pageSize?: string }) => void;
  onResetFilters: () => void;
  queue: TutoringQueueItem[] | undefined;
  onActivate: (item: TutoringQueueItem) => void;
}

export function TutoringQueueCard({
  canManage,
  groups,
  students,
  reasonType,
  groupId,
  studentUserId,
  search,
  onGroupSearchChange,
  onStudentSearchChange,
  groupHasMore,
  studentHasMore,
  groupsLoadingMore,
  studentsLoadingMore,
  onLoadMoreGroups,
  onLoadMoreStudents,
  isFetching,
  count,
  page,
  pageSize,
  onReasonTypeChange,
  onGroupIdChange,
  onStudentUserIdChange,
  onSearchChange,
  onParamsChange,
  onResetFilters,
  queue,
  onActivate,
}: Props) {
  const t = useTranslations('ws-tutoring');
  const tCommon = useTranslations();
  const summary = queueSummary(queue ?? []);

  const studentMap = useMemo(() => {
    const map = new Map<string, WorkspaceBasicUserRecord>();
    for (const student of students) {
      map.set(student.id, student);
    }
    return map;
  }, [students]);

  const groupOptions: ComboboxOption[] = useMemo(() => {
    const options: ComboboxOption[] = [
      { value: 'all', label: t('all_groups') },
      ...groups.map((group) => ({
        value: group.id,
        label: group.name ?? 'Unnamed',
      })),
    ];

    const seen = new Set(options.map((option) => option.value));
    for (const item of queue ?? []) {
      if (!item.group_id || seen.has(item.group_id)) {
        continue;
      }

      options.push({
        value: item.group_id,
        label: item.group_name || item.group_id,
      });
      seen.add(item.group_id);
    }

    return options;
  }, [groups, queue, t]);

  const studentOptions: ComboboxOption[] = useMemo(() => {
    const options: ComboboxOption[] = [
      { value: 'all', label: t('all_students') },
      ...students.map((student) => ({
        value: student.id,
        label: getDisplayName(student),
      })),
    ];

    const seen = new Set(options.map((option) => option.value));
    for (const item of queue ?? []) {
      if (!item.student_user_id || seen.has(item.student_user_id)) {
        continue;
      }

      options.push({
        value: item.student_user_id,
        label: item.student_name || item.student_user_id,
      });
      seen.add(item.student_user_id);
    }

    return options;
  }, [queue, students, t]);

  const columns = ({ t: tableT }: { t: ReturnType<typeof useTranslations> }) =>
    [
      {
        id: 'student_name',
        header: ({ column }) => (
          <DataTableColumnHeader
            t={tableT}
            column={column}
            title={t('student')}
          />
        ),
        cell: ({ row }) => {
          const student = studentMap.get(row.original.student_user_id);
          return student
            ? getDisplayName(student)
            : row.original.student_name || '-';
        },
      },
      {
        accessorKey: 'group_name',
        header: ({ column }) => (
          <DataTableColumnHeader
            t={tableT}
            column={column}
            title={t('group')}
          />
        ),
      },
      {
        accessorKey: 'reason_type',
        header: ({ column }) => (
          <DataTableColumnHeader
            t={tableT}
            column={column}
            title={t('reason')}
          />
        ),
      },
      {
        accessorKey: 'absence_deficit',
        header: ({ column }) => (
          <DataTableColumnHeader
            t={tableT}
            column={column}
            title={t('deficit_label')}
          />
        ),
      },
      {
        accessorKey: 'feedback_content',
        header: ({ column }) => (
          <DataTableColumnHeader
            t={tableT}
            column={column}
            title={t('feedback')}
          />
        ),
      },
      {
        id: 'actions',
        header: () => <div className="text-right">{t('actions')}</div>,
        cell: ({ row }) =>
          canManage ? (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onActivate(row.original)}
              >
                {t('activate')}
              </Button>
            </div>
          ) : null,
      },
    ] satisfies ColumnDef<TutoringQueueItem>[];

  return (
    <section className="space-y-3">
      <FeatureSummary
        title={
          <h3 className="font-semibold text-lg">{t('queue_title', summary)}</h3>
        }
      />

      <div className="relative">
        {isFetching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-md border bg-background/90 px-4 py-2 shadow-lg">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-muted-foreground text-sm">
                {tCommon('common.loading')}
              </span>
            </div>
          </div>
        )}
        <DataTable
          t={tCommon}
          data={queue}
          count={count}
          pageIndex={page > 0 ? page - 1 : 0}
          pageSize={pageSize}
          namespace="tutoring-queue-table"
          columnGenerator={columns}
          disableSearch
          setParams={onParamsChange}
          filters={
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={search}
                onChange={(event) => onSearchChange(event.currentTarget.value)}
                placeholder={t('search_queue')}
                className="h-9 w-56"
              />

              <Select value={reasonType} onValueChange={onReasonTypeChange}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder={t('reason')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all_reasons')}</SelectItem>
                  <SelectItem value="ABSENT_RECOVERY">
                    {t('absent_recovery')}
                  </SelectItem>
                  <SelectItem value="WEAK_SUPPORT">
                    {t('weak_support')}
                  </SelectItem>
                  <SelectItem value="BOTH">{t('both_reason')}</SelectItem>
                </SelectContent>
              </Select>

              <Combobox
                options={groupOptions}
                selected={groupId}
                onChange={(value) => onGroupIdChange(value as string)}
                placeholder={t('all_groups')}
                searchPlaceholder={t('search_groups')}
                onSearchChange={onGroupSearchChange}
                hasMore={groupHasMore}
                loadingMore={groupsLoadingMore}
                onLoadMore={onLoadMoreGroups}
                className="w-52"
              />

              <Combobox
                options={studentOptions}
                selected={studentUserId}
                onChange={(value) => onStudentUserIdChange(value as string)}
                placeholder={t('all_students')}
                searchPlaceholder={t('search_students')}
                onSearchChange={onStudentSearchChange}
                hasMore={studentHasMore}
                loadingMore={studentsLoadingMore}
                onLoadMore={onLoadMoreStudents}
                className="w-56"
              />
            </div>
          }
          resetParams={onResetFilters}
          isFiltered={
            search.trim().length > 0 ||
            reasonType !== 'all' ||
            groupId !== 'all' ||
            studentUserId !== 'all'
          }
        />
      </div>
    </section>
  );
}
