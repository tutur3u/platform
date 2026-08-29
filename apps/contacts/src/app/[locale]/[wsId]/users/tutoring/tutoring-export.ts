import type {
  InternalApiQuery,
  TutoringDetailedExportRow,
  TutoringPayrollExportRow,
} from '@tuturuuu/internal-api';
import { exportTutoringSessions } from '@tuturuuu/internal-api';
import { XLSX } from '@tuturuuu/ui/xlsx';
import { jsonToCSV } from 'react-papaparse';

export type TutoringExportFormat =
  | 'detailed-csv'
  | 'detailed-xlsx'
  | 'payroll-csv'
  | 'payroll-xlsx';

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

export function toDetailedExportRows(rows: TutoringDetailedExportRow[]) {
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

function writeCsv(rows: object[], filename: string) {
  downloadBlob(
    new Blob(
      // Session content and learner names are operator-supplied, so a cell
      // starting with `=`, `+`, `-` or `@` would execute as a formula when the
      // export is opened in Excel or LibreOffice.
      [jsonToCSV(rows, { escapeFormulae: true })],
      { type: 'text/csv;charset=utf-8;' }
    ),
    filename
  );
}

export function toPayrollExportRows(rows: TutoringPayrollExportRow[]) {
  return rows.map((row) => ({
    CompletedSessions: row.completed_sessions,
    Teacher: row.teacher_name,
    TotalMinutes: row.total_minutes,
  }));
}

function writeXlsx(rows: object[], sheetName: string, filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

export async function runTutoringExport({
  format,
  query,
  wsId,
}: {
  format: TutoringExportFormat;
  query: InternalApiQuery;
  wsId: string;
}) {
  const wantsPayroll = format.startsWith('payroll');
  const response = await exportTutoringSessions(wsId, {
    ...query,
    mode: wantsPayroll ? 'payroll' : 'detailed',
  });

  if (wantsPayroll) {
    if (response.mode !== 'payroll') {
      throw new Error('Unexpected export mode');
    }
    const rows = toPayrollExportRows(response.data);
    if (format === 'payroll-csv') {
      writeCsv(rows, 'tutoring-payroll.csv');
      return rows.length;
    }
    writeXlsx(rows, 'Payroll', 'tutoring-payroll.xlsx');
    return rows.length;
  }

  if (response.mode !== 'detailed') {
    throw new Error('Unexpected export mode');
  }

  const rows = toDetailedExportRows(response.data);
  if (format === 'detailed-csv') {
    writeCsv(rows, 'tutoring-detailed.csv');
    return rows.length;
  }

  writeXlsx(rows, 'Detailed', 'tutoring-detailed.xlsx');
  return rows.length;
}
