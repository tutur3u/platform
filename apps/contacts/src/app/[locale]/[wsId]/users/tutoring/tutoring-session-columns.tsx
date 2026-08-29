'use client';

import {
  CircleCheck,
  CircleX,
  MessageSquareText,
  MoreHorizontal,
  RotateCcw,
  UserX,
} from '@tuturuuu/icons';
import type {
  TutoringAttendanceStatus,
  TutoringSessionRecord,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import type { ColumnDef } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import type { useTranslations } from 'next-intl';
import { TutoringReasonBadge, TutoringStatusBadge } from './tutoring-badges';
import { formatSessionTimeRange } from './tutoring-filters';
import { getDisplayName } from './tutoring-types';

export interface TutoringSessionColumnActions {
  canManage: boolean;
  isMarking: boolean;
  locale: string;
  onMark: (id: string, status: TutoringAttendanceStatus) => void;
  onParentMessage: (session: TutoringSessionRecord) => void;
  t: ReturnType<typeof useTranslations>;
  tableT: ReturnType<typeof useTranslations>;
}

function formatWeekday(isoDate: string, locale: string) {
  const [year, month, day] = isoDate
    .split('-')
    .map((part) => Number.parseInt(part, 10));

  if (!(year && month && day)) return '';

  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
      new Date(year, month - 1, day)
    );
  } catch {
    return '';
  }
}

function SessionActionsCell({
  actions,
  session,
}: {
  actions: TutoringSessionColumnActions;
  session: TutoringSessionRecord;
}) {
  const { canManage, isMarking, onMark, onParentMessage, t } = actions;
  const isPending = session.attendance_status === 'PENDING';

  return (
    <div className="flex items-center justify-end gap-1">
      {canManage && isPending ? (
        <Button
          className="h-8"
          disabled={isMarking}
          onClick={() => onMark(session.id, 'DONE')}
          size="sm"
          variant="outline"
        >
          <CircleCheck className="h-4 w-4 text-dynamic-green" />
          {t('mark_done')}
        </Button>
      ) : null}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t('actions')}
            className="h-8 w-8"
            size="icon"
            variant="ghost"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!canManage}
            onClick={() => onParentMessage(session)}
          >
            <MessageSquareText className="h-4 w-4" />
            {t('parent_message')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={
              !canManage || isMarking || session.attendance_status === 'DONE'
            }
            onClick={() => onMark(session.id, 'DONE')}
          >
            <CircleCheck className="h-4 w-4 text-dynamic-green" />
            {t('mark_done')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={
              !canManage || isMarking || session.attendance_status === 'NO_SHOW'
            }
            onClick={() => onMark(session.id, 'NO_SHOW')}
          >
            <UserX className="h-4 w-4 text-dynamic-red" />
            {t('mark_no_show')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={
              !canManage ||
              isMarking ||
              session.attendance_status === 'CANCELLED'
            }
            onClick={() => onMark(session.id, 'CANCELLED')}
          >
            <CircleX className="h-4 w-4" />
            {t('mark_cancelled')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canManage || isMarking || isPending}
            onClick={() => onMark(session.id, 'PENDING')}
          >
            <RotateCcw className="h-4 w-4" />
            {t('mark_pending')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function buildTutoringSessionColumns(
  actions: TutoringSessionColumnActions
) {
  const { locale, t, tableT } = actions;

  return [
    {
      accessorKey: 'session_date',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} t={tableT} title={t('when')} />
      ),
      cell: ({ row }) => (
        <div className="min-w-36">
          <p className="font-medium">
            {row.original.session_date}
            <span className="ml-1.5 font-normal text-muted-foreground text-xs">
              {formatWeekday(row.original.session_date, locale)}
            </span>
          </p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatSessionTimeRange(
              row.original.start_time,
              row.original.duration_minutes
            )}
            <span className="ml-1.5">
              ({t('minutes_short', { count: row.original.duration_minutes })})
            </span>
          </p>
        </div>
      ),
    },
    {
      id: 'student',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={tableT}
          title={t('student')}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-40">
          <p className="font-medium">{getDisplayName(row.original.student)}</p>
          <p className="truncate text-muted-foreground text-xs">
            {row.original.group?.name ?? '-'}
          </p>
        </div>
      ),
    },
    {
      id: 'teacher',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={tableT}
          title={t('teacher')}
        />
      ),
      cell: ({ row }) => getDisplayName(row.original.teacher),
    },
    {
      accessorKey: 'reason_type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} t={tableT} title={t('reason')} />
      ),
      cell: ({ row }) => (
        <div className="min-w-32 space-y-1">
          <TutoringReasonBadge reason={row.original.reason_type} />
          {row.original.content ? (
            <p className="line-clamp-1 max-w-56 text-muted-foreground text-xs">
              {row.original.content}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'attendance_status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} t={tableT} title={t('status')} />
      ),
      cell: ({ row }) => (
        <TutoringStatusBadge status={row.original.attendance_status} />
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">{t('actions')}</div>,
      cell: ({ row }) => (
        <SessionActionsCell actions={actions} session={row.original} />
      ),
    },
  ] satisfies ColumnDef<TutoringSessionRecord>[];
}
