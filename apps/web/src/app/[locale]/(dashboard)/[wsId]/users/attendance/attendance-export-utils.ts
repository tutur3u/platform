import type { WorkspaceAttendanceExportRecord } from '@tuturuuu/internal-api/users';
import { format, parseISO } from 'date-fns';

export type AttendanceExportFileType = 'csv' | 'excel';

export interface AttendanceExportLabels {
  columns: {
    date: string;
    userName: string;
    email: string;
    group: string;
    status: string;
    notes: string;
    userId: string;
    groupId: string;
  };
  statuses: {
    absent: string;
    late: string;
    present: string;
    unknown: string;
  };
}

function formatUserFacingDate(value: string) {
  try {
    return format(parseISO(value), 'yyyy-MM-dd');
  } catch {
    return value;
  }
}

export function buildAttendanceExportFilename(
  startDate: string,
  endDate: string,
  fileType: AttendanceExportFileType
) {
  const extension = fileType === 'csv' ? 'csv' : 'xlsx';
  return `attendance_${startDate}_to_${endDate}.${extension}`;
}

function getStatusLabel(
  status: string,
  labels: AttendanceExportLabels['statuses']
) {
  switch (status) {
    case 'PRESENT':
      return labels.present;
    case 'ABSENT':
      return labels.absent;
    case 'LATE':
      return labels.late;
    default:
      return labels.unknown;
  }
}

export function sortAttendanceExportRecords(
  records: WorkspaceAttendanceExportRecord[]
) {
  return [...records].sort((left, right) => {
    const dateCompare = left.date.localeCompare(right.date);
    if (dateCompare !== 0) return dateCompare;

    const userCompare = left.userName.localeCompare(right.userName);
    if (userCompare !== 0) return userCompare;

    return (left.groupName ?? '').localeCompare(right.groupName ?? '');
  });
}

export function toAttendanceExportRows(
  records: WorkspaceAttendanceExportRecord[],
  labels: AttendanceExportLabels
) {
  return sortAttendanceExportRecords(records).map((record) => ({
    [labels.columns.date]: formatUserFacingDate(record.date),
    [labels.columns.userName]: record.userName,
    [labels.columns.email]: record.userEmail ?? '',
    [labels.columns.group]: record.groupName ?? '',
    [labels.columns.status]: getStatusLabel(record.status, labels.statuses),
    [labels.columns.notes]: record.notes ?? '',
    [labels.columns.userId]: record.userId,
    [labels.columns.groupId]: record.groupId,
  }));
}
