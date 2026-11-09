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

/** Red Student font. Excel stores the color as alpha plus RGB. */
const STUDENT_ATTENTION_ARGB = 'FFFF0000';

const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

const DETAILED_HEADERS = [
  'AttendanceStatus',
  'Content',
  'Date',
  'DurationMinutes',
  'Group',
  'ReasonType',
  'Student',
  'Teacher',
  'Time',
] as const;

type DetailedHeader = (typeof DETAILED_HEADERS)[number];

type DetailedDisplayRow = Record<DetailedHeader, string | number>;

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

function detailedDisplayRow(
  row: TutoringDetailedExportRow
): DetailedDisplayRow {
  return {
    AttendanceStatus: row.attendance_status,
    Content: row.content,
    Date: row.date,
    DurationMinutes: row.duration_minutes,
    Group: row.group_name,
    ReasonType: row.reason_type,
    Student: row.student_name,
    Teacher: row.teacher_name,
    Time: row.time,
  };
}

export function toDetailedExportRows(rows: TutoringDetailedExportRow[]) {
  return rows.map(detailedDisplayRow);
}

export function detailedStudentNeedsAttention(row: TutoringDetailedExportRow) {
  const hasScheduledTime = CLOCK_TIME.test(row.time.trim());
  return row.teacher_user_id === null || !hasScheduledTime;
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
    TotalCong: row.total_cong,
  }));
}

function writeXlsx(rows: object[], sheetName: string, filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

function workbookBytes(written: ArrayBuffer | ArrayBufferView) {
  if (written instanceof ArrayBuffer) return new Uint8Array(written);
  return new Uint8Array(
    written.buffer,
    written.byteOffset,
    written.byteLength
  ).slice();
}

// SheetJS community cannot write font colors; load the styled writer on export.
export async function buildDetailedTutoringXlsx(
  rows: TutoringDetailedExportRow[]
) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Detailed');
  sheet.addRow([...DETAILED_HEADERS]);
  const studentColumn = DETAILED_HEADERS.indexOf('Student') + 1;

  for (const source of rows) {
    const display = detailedDisplayRow(source);
    const excelRow = sheet.addRow(
      DETAILED_HEADERS.map((header) => display[header])
    );
    if (detailedStudentNeedsAttention(source)) {
      excelRow.getCell(studentColumn).font = {
        color: { argb: STUDENT_ATTENTION_ARGB },
      };
    }
  }

  return workbookBytes(await workbook.xlsx.writeBuffer());
}

async function writeDetailedXlsx(
  rows: TutoringDetailedExportRow[],
  filename: string
) {
  const bytes = await buildDetailedTutoringXlsx(rows);
  downloadBlob(
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename
  );
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

  await writeDetailedXlsx(response.data, 'tutoring-detailed.xlsx');
  return rows.length;
}
