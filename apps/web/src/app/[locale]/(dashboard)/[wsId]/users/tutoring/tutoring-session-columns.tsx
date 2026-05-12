import type { ColumnDef } from '@tanstack/react-table';
import type {
  TutoringAttendanceStatus,
  TutoringSessionRecord,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import type { useTranslations } from 'next-intl';
import { getDisplayName, STATUS_ACTIONS } from './tutoring-types';

export function buildTutoringSessionColumns({
  canManage,
  isMarking,
  onMark,
  t,
  tableT,
}: {
  canManage: boolean;
  isMarking: boolean;
  onMark: (id: string, status: TutoringAttendanceStatus) => void;
  t: ReturnType<typeof useTranslations>;
  tableT: ReturnType<typeof useTranslations>;
}) {
  return [
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
        <DataTableColumnHeader t={tableT} column={column} title={t('group')} />
      ),
      cell: ({ row }) => row.original.group?.name ?? '-',
    },
    {
      accessorKey: 'reason_type',
      header: ({ column }) => (
        <DataTableColumnHeader t={tableT} column={column} title={t('reason')} />
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
        <DataTableColumnHeader t={tableT} column={column} title={t('status')} />
      ),
      cell: ({ row }) => {
        const status = row.original.attendance_status;
        if (status === 'PENDING') {
          return (
            <Badge
              variant="outline"
              className="rounded-full border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
            >
              {t('status_pending')}
            </Badge>
          );
        }
        if (status === 'DONE') {
          return (
            <Badge
              variant="outline"
              className="rounded-full border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
            >
              {t('status_done')}
            </Badge>
          );
        }
        if (status === 'NO_SHOW') {
          return (
            <Badge
              variant="outline"
              className="rounded-full border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400"
            >
              {t('status_no_show')}
            </Badge>
          );
        }
        if (status === 'CANCELLED') {
          return (
            <Badge
              variant="outline"
              className="rounded-full border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400"
            >
              {t('status_cancelled')}
            </Badge>
          );
        }
        return status;
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">{t('actions')}</div>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Select
            value={row.original.attendance_status}
            onValueChange={(value) =>
              onMark(row.original.id, value as TutoringAttendanceStatus)
            }
            disabled={!canManage || isMarking}
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_ACTIONS.map((status) => {
                const label =
                  status === 'PENDING'
                    ? t('status_pending')
                    : status === 'DONE'
                      ? t('status_done')
                      : status === 'NO_SHOW'
                        ? t('status_no_show')
                        : status === 'CANCELLED'
                          ? t('status_cancelled')
                          : status;
                return (
                  <SelectItem key={status} value={status}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      ),
    },
  ] satisfies ColumnDef<TutoringSessionRecord>[];
}
