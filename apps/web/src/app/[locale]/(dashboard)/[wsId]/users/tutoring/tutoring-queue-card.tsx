'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2 } from '@tuturuuu/icons';
import type {
  TutoringQueueItem,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import {
  getNextWorkspaceUserGroupsPageParam,
  listWorkspaceBasicUsers,
  listWorkspaceUserGroups,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { getDisplayName, queueSummary } from './tutoring-types';

interface TutoringQueueFilters {
  reasonType: string;
  groupId: string;
  studentUserId: string;
  search: string;
}

interface TutoringQueuePagination {
  count: number;
  page: number;
  pageSize: number;
}

interface TutoringQueueLookupState {
  groups: UserGroup[];
  students: WorkspaceBasicUserRecord[];
}

interface TutoringQueueActions {
  onReasonTypeChange: (value: string) => void;
  onGroupIdChange: (value: string) => void;
  onStudentUserIdChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onParamsChange: (params: { page?: number; pageSize?: string }) => void;
  onResetFilters: () => void;
  onActivate: (item: TutoringQueueItem) => void;
}

interface Props {
  wsId: string;
  canManage: boolean;
  queue: TutoringQueueItem[] | undefined;
  filters: TutoringQueueFilters;
  pagination: TutoringQueuePagination;
  lookup: TutoringQueueLookupState;
  isFetching: boolean;
  actions: TutoringQueueActions;
}

export function TutoringQueueCard({
  wsId,
  canManage,
  queue,
  filters,
  pagination,
  lookup,
  isFetching,
  actions,
}: Props) {
  const t = useTranslations('ws-tutoring');
  const tCommon = useTranslations();
  const summary = queueSummary(queue ?? []);
  const [groupSearch, setGroupSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [debouncedGroupSearch] = useDebounce(groupSearch, 250);
  const [debouncedStudentSearch] = useDebounce(studentSearch, 250);

  const groupsQuery = useInfiniteQuery({
    queryKey: ['tutoring-queue-filter-groups', wsId, debouncedGroupSearch],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listWorkspaceUserGroups(wsId, {
        status: 'active',
        q: debouncedGroupSearch || undefined,
        page: pageParam,
        pageSize: 20,
      }),
    getNextPageParam: (lastPage, allPages) =>
      getNextWorkspaceUserGroupsPageParam(lastPage, allPages),
  });

  const studentsQuery = useInfiniteQuery({
    queryKey: ['tutoring-queue-filter-students', wsId, debouncedStudentSearch],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listWorkspaceBasicUsers(wsId, {
        from: pageParam,
        limit: 20,
        q: debouncedStudentSearch || undefined,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (total, page) => total + page.data.length,
        0
      );
      if (loadedCount >= (lastPage.count ?? 0) || lastPage.data.length < 20) {
        return undefined;
      }

      return loadedCount;
    },
  });

  const loadedGroups = useMemo(
    () => groupsQuery.data?.pages.flatMap((page) => page.data ?? []) ?? [],
    [groupsQuery.data?.pages]
  );
  const loadedStudents = useMemo(
    () => studentsQuery.data?.pages.flatMap((page) => page.data ?? []) ?? [],
    [studentsQuery.data?.pages]
  );
  const groups = loadedGroups.length > 0 ? loadedGroups : lookup.groups;
  const students = loadedStudents.length > 0 ? loadedStudents : lookup.students;

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
                onClick={() => actions.onActivate(row.original)}
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
          count={pagination.count}
          pageIndex={pagination.page > 0 ? pagination.page - 1 : 0}
          pageSize={pagination.pageSize}
          namespace="tutoring-queue-table"
          columnGenerator={columns}
          disableSearch
          setParams={actions.onParamsChange}
          filters={
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={filters.search}
                onChange={(event) =>
                  actions.onSearchChange(event.currentTarget.value)
                }
                placeholder={t('search_queue')}
                className="h-9 w-56"
              />

              <Select
                value={filters.reasonType}
                onValueChange={actions.onReasonTypeChange}
              >
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
                selected={filters.groupId}
                onChange={(value) => actions.onGroupIdChange(value as string)}
                placeholder={t('all_groups')}
                searchPlaceholder={t('search_groups')}
                onSearchChange={setGroupSearch}
                hasMore={Boolean(groupsQuery.hasNextPage)}
                loadingMore={groupsQuery.isFetchingNextPage}
                onLoadMore={() => {
                  if (groupsQuery.hasNextPage) {
                    void groupsQuery.fetchNextPage();
                  }
                }}
                className="w-52"
              />

              <Combobox
                options={studentOptions}
                selected={filters.studentUserId}
                onChange={(value) =>
                  actions.onStudentUserIdChange(value as string)
                }
                placeholder={t('all_students')}
                searchPlaceholder={t('search_students')}
                onSearchChange={setStudentSearch}
                hasMore={Boolean(studentsQuery.hasNextPage)}
                loadingMore={studentsQuery.isFetchingNextPage}
                onLoadMore={() => {
                  if (studentsQuery.hasNextPage) {
                    void studentsQuery.fetchNextPage();
                  }
                }}
                className="w-56"
              />
            </div>
          }
          resetParams={actions.onResetFilters}
          isFiltered={
            filters.search.trim().length > 0 ||
            filters.reasonType !== 'all' ||
            filters.groupId !== 'all' ||
            filters.studentUserId !== 'all'
          }
        />
      </div>
    </section>
  );
}
