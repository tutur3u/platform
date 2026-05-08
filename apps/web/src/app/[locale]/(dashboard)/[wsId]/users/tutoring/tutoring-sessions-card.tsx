'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Download } from '@tuturuuu/icons';
import type {
  TutoringAttendanceStatus,
  TutoringSessionRecord,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { XLSX } from '@tuturuuu/ui/xlsx';
import { useTranslations } from 'next-intl';
import { jsonToCSV } from 'react-papaparse';
import { TutoringCreateCard } from './tutoring-create-card';
import type { TutoringFormValues } from './tutoring-types';
import {
  getDisplayName,
  STATUS_ACTIONS,
  toDetailedRows,
  toPayrollRows,
} from './tutoring-types';

interface TutoringSessionsFilters {
  reasonType: string;
  attendanceStatus: string;
  groupId: string;
  studentUserId: string;
}

interface TutoringSessionsCreateState {
  form: TutoringFormValues;
  isSubmitting: boolean;
  open: boolean;
}

interface TutoringSessionsPagination {
  count: number;
  page: number;
  pageSize: number;
}

interface TutoringSessionsActions {
  onReasonTypeChange: (value: string) => void;
  onAttendanceStatusChange: (value: string) => void;
  onGroupIdChange: (value: string) => void;
  onStudentUserIdChange: (value: string) => void;
  onCreateFormChange: (next: TutoringFormValues) => void;
  onCreate: () => void;
  onCreateDialogOpenChange: (open: boolean) => void;
  onParamsChange: (params: { page?: number; pageSize?: string }) => void;
  onResetFilters: () => void;
  onMark: (id: string, status: TutoringAttendanceStatus) => void;
}

interface Props {
  wsId: string;
  canManage: boolean;
  sessions: TutoringSessionRecord[];
  groups: UserGroup[];
  students: WorkspaceBasicUserRecord[];
  filters: TutoringSessionsFilters;
  create: TutoringSessionsCreateState;
  pagination: TutoringSessionsPagination;
  isMarking: boolean;
  actions: TutoringSessionsActions;
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function TutoringSessionsCard({
  wsId,
  canManage,
  sessions,
  groups,
  students,
  filters,
  create,
  pagination,
  isMarking,
  actions,
}: Props) {
  const t = useTranslations('ws-tutoring');
  const tCommon = useTranslations();

  const columns = ({ t: tableT }: { t: ReturnType<typeof useTranslations> }) =>
    [
      {
        accessorKey: 'session_date',
        header: ({ column }) => (
          <DataTableColumnHeader t={tableT} column={column} title={t('date')} />
        ),
      },
      {
        accessorKey: 'start_time',
        header: ({ column }) => (
          <DataTableColumnHeader t={tableT} column={column} title={t('time')} />
        ),
        cell: ({ row }) => String(row.original.start_time).slice(0, 5),
      },
      {
        id: 'student',
        header: ({ column }) => (
          <DataTableColumnHeader
            t={tableT}
            column={column}
            title={t('student')}
          />
        ),
        cell: ({ row }) => getDisplayName(row.original.student),
      },
      {
        id: 'teacher',
        header: ({ column }) => (
          <DataTableColumnHeader
            t={tableT}
            column={column}
            title={t('teacher')}
          />
        ),
        cell: ({ row }) => getDisplayName(row.original.teacher),
      },
      {
        id: 'group',
        header: ({ column }) => (
          <DataTableColumnHeader
            t={tableT}
            column={column}
            title={t('group')}
          />
        ),
        cell: ({ row }) => row.original.group?.name ?? '-',
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
        cell: ({ row }) => {
          const reason = row.original.reason_type;
          if (reason === 'ABSENT_RECOVERY') {
            return (
              <Badge
                variant="outline"
                className="rounded-full border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
              >
                {t('absent_recovery')}
              </Badge>
            );
          }
          if (reason === 'WEAK_SUPPORT') {
            return (
              <Badge
                variant="outline"
                className="rounded-full border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-400"
              >
                {t('weak_support')}
              </Badge>
            );
          }
          if (reason === 'CUSTOM') {
            return (
              <Badge
                variant="outline"
                className="rounded-full border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400"
              >
                {t('custom_reason')}
              </Badge>
            );
          }
          return reason;
        },
      },
      {
        accessorKey: 'attendance_status',
        header: ({ column }) => (
          <DataTableColumnHeader
            t={tableT}
            column={column}
            title={t('status')}
          />
        ),
      },
      {
        id: 'actions',
        header: () => <div className="text-right">{t('actions')}</div>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Select
              value={row.original.attendance_status}
              onValueChange={(value) =>
                actions.onMark(
                  row.original.id,
                  value as TutoringAttendanceStatus
                )
              }
              disabled={!canManage || isMarking}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ACTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ),
      },
    ] satisfies ColumnDef<TutoringSessionRecord>[];

  const handleExportDetailedCsv = () => {
    const csv = jsonToCSV(toDetailedRows(sessions));
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      'tutoring-detailed.csv'
    );
  };

  const handleExportPayrollCsv = () => {
    const csv = jsonToCSV(toPayrollRows(sessions));
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      'tutoring-payroll.csv'
    );
  };

  const handleExportDetailedXlsx = () => {
    try {
      const ws = XLSX.utils.json_to_sheet(toDetailedRows(sessions));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Detailed');
      XLSX.writeFile(wb, 'tutoring-detailed.xlsx');
    } catch {
      toast.error(t('export_failed'));
    }
  };

  return (
    <section className="space-y-3">
      <FeatureSummary
        title={<h3 className="font-semibold text-lg">{t('schedule_title')}</h3>}
        action={
          canManage ? (
            <Dialog
              open={create.open}
              onOpenChange={actions.onCreateDialogOpenChange}
            >
              <Button
                size="sm"
                onClick={() => actions.onCreateDialogOpenChange(true)}
              >
                {t('create')}
              </Button>
              <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                  <DialogTitle>{t('create_session')}</DialogTitle>
                </DialogHeader>
                <TutoringCreateCard
                  wsId={wsId}
                  form={create.form}
                  groups={groups}
                  students={students}
                  isSubmitting={create.isSubmitting}
                  showTitle={false}
                  onChange={actions.onCreateFormChange}
                  onSubmit={actions.onCreate}
                />
              </DialogContent>
            </Dialog>
          ) : null
        }
      />
      <DataTable
        t={tCommon}
        data={sessions}
        count={pagination.count}
        pageIndex={pagination.page > 0 ? pagination.page - 1 : 0}
        pageSize={pagination.pageSize}
        namespace="tutoring-sessions-table"
        columnGenerator={columns}
        disableSearch
        setParams={actions.onParamsChange}
        filters={
          <div className="flex flex-wrap items-center gap-2">
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
                <SelectItem value="CUSTOM">{t('custom_reason')}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.attendanceStatus}
              onValueChange={actions.onAttendanceStatusChange}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t('status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_statuses')}</SelectItem>
                <SelectItem value="PENDING">PENDING</SelectItem>
                <SelectItem value="DONE">DONE</SelectItem>
                <SelectItem value="NO_SHOW">NO_SHOW</SelectItem>
                <SelectItem value="CANCELLED">CANCELLED</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.groupId}
              onValueChange={actions.onGroupIdChange}
            >
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

            <Select
              value={filters.studentUserId}
              onValueChange={actions.onStudentUserIdChange}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder={t('student')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_students')}</SelectItem>
                {students.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {getDisplayName(student)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        resetParams={actions.onResetFilters}
        toolbarActions={
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-8 w-full md:w-fit"
              >
                <Download className="h-4 w-4" />
                {tCommon('common.export')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportDetailedCsv}>
                {t('export_detailed_csv')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPayrollCsv}>
                {t('export_payroll_csv')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportDetailedXlsx}>
                {t('export_detailed_xlsx')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
        isFiltered={
          filters.reasonType !== 'all' ||
          filters.attendanceStatus !== 'all' ||
          filters.groupId !== 'all' ||
          filters.studentUserId !== 'all'
        }
      />
    </section>
  );
}
