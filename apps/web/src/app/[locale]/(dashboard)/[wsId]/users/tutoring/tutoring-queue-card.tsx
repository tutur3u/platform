'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type {
  TutoringQueueItem,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
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
import { queueSummary } from './tutoring-types';

interface Props {
  canManage: boolean;
  groups: UserGroup[];
  students: WorkspaceBasicUserRecord[];
  reasonType: string;
  groupId: string;
  studentUserId: string;
  search: string;
  onReasonTypeChange: (value: string) => void;
  onGroupIdChange: (value: string) => void;
  onStudentUserIdChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onResetFilters: () => void;
  queue: TutoringQueueItem[];
  onActivate: (item: TutoringQueueItem) => void;
}

function displayName(user: WorkspaceBasicUserRecord) {
  return user.full_name ?? user.display_name ?? user.email ?? '-';
}

export function TutoringQueueCard({
  canManage,
  groups,
  students,
  reasonType,
  groupId,
  studentUserId,
  search,
  onReasonTypeChange,
  onGroupIdChange,
  onStudentUserIdChange,
  onSearchChange,
  onResetFilters,
  queue,
  onActivate,
}: Props) {
  const t = useTranslations('ws-tutoring');
  const tCommon = useTranslations();
  const summary = queueSummary(queue);

  const columns = ({ t: tableT }: { t: ReturnType<typeof useTranslations> }) =>
    [
      {
        accessorKey: 'student_name',
        header: ({ column }) => (
          <DataTableColumnHeader
            t={tableT}
            column={column}
            title={t('student')}
          />
        ),
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
      <h3 className="font-semibold text-lg">{t('queue_title', summary)}</h3>

      <DataTable
        t={tCommon}
        data={queue}
        count={queue.length}
        namespace="tutoring-queue-table"
        disableSearch
        hidePagination
        columnGenerator={columns}
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

            <Select value={groupId} onValueChange={onGroupIdChange}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder={t('group')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_groups')}</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={studentUserId} onValueChange={onStudentUserIdChange}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder={t('student')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_students')}</SelectItem>
                {students.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {displayName(student)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
    </section>
  );
}
