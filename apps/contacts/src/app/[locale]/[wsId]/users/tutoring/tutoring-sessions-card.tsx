'use client';

import { Download } from '@tuturuuu/icons';
import type {
  TutoringAttendanceStatus,
  TutoringDetailedExportRow,
  TutoringPayrollExportRow,
  TutoringSessionRecord,
  WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { exportTutoringSessions } from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
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
import { buildTutoringSessionColumns } from './tutoring-session-columns';
import type { TutoringFormValues } from './tutoring-types';
import { getDisplayName } from './tutoring-types';

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

function toDetailedExportRows(rows: TutoringDetailedExportRow[]) {
  return rows.map((row) => ({
    AttendanceStatus: row.attendance_status,
    Content: row.content,
    Date: row.date,
    DurationMinutes: row.duration_minutes,
    Group: row.group_name,
    ReasonType: row.reason_type,
    Student: row.student_name,
    Teacher: row.teacher_name,
    Time: row.time,
  }));
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
    buildTutoringSessionColumns({
      canManage,
      isMarking,
      onMark: actions.onMark,
      t,
      tableT,
    });

  const exportFilters = {
    attendanceStatus:
      filters.attendanceStatus === 'all' ? undefined : filters.attendanceStatus,
    groupId: filters.groupId === 'all' ? undefined : filters.groupId,
    reasonType: filters.reasonType === 'all' ? undefined : filters.reasonType,
    studentUserId:
      filters.studentUserId === 'all' ? undefined : filters.studentUserId,
  };

  const loadDetailedExportRows = async () => {
    const response = await exportTutoringSessions(wsId, {
      ...exportFilters,
      mode: 'detailed',
    });
    if (response.mode !== 'detailed') {
      throw new Error('Unexpected export mode');
    }
    return response.data;
  };

  const loadPayrollExportRows = async () => {
    const response = await exportTutoringSessions(wsId, {
      ...exportFilters,
      mode: 'payroll',
    });
    if (response.mode !== 'payroll') {
      throw new Error('Unexpected export mode');
    }
    return response.data;
  };

  const handleExportDetailedCsv = async () => {
    try {
      const rows = await loadDetailedExportRows();
      const csv = jsonToCSV(toDetailedExportRows(rows));
      downloadBlob(
        new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
        'tutoring-detailed.csv'
      );
    } catch {
      toast.error(t('export_failed'));
    }
  };

  const handleExportPayrollCsv = async () => {
    try {
      const rows: TutoringPayrollExportRow[] = await loadPayrollExportRows();
      const csv = jsonToCSV(rows);
      downloadBlob(
        new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
        'tutoring-payroll.csv'
      );
    } catch {
      toast.error(t('export_failed'));
    }
  };

  const handleExportDetailedXlsx = async () => {
    try {
      const rows = await loadDetailedExportRows();
      const ws = XLSX.utils.json_to_sheet(toDetailedExportRows(rows));
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
                <SelectItem value="PENDING">{t('status_pending')}</SelectItem>
                <SelectItem value="DONE">{t('status_done')}</SelectItem>
                <SelectItem value="NO_SHOW">{t('status_no_show')}</SelectItem>
                <SelectItem value="CANCELLED">
                  {t('status_cancelled')}
                </SelectItem>
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
