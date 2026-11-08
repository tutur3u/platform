import type {
  TutoringDetailedExportRow,
  TutoringPayrollExportRow,
} from '@tuturuuu/internal-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const jsonToCSV = vi.fn(() => 'csv');
const exportTutoringSessions = vi.fn();
const writeFile = vi.fn();

vi.mock('react-papaparse', () => ({
  jsonToCSV: (...args: unknown[]) => jsonToCSV(...(args as [])) as unknown,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  exportTutoringSessions: (...args: unknown[]) =>
    exportTutoringSessions(...args) as unknown,
}));

vi.mock('@tuturuuu/ui/xlsx', () => ({
  XLSX: {
    utils: {
      book_append_sheet: vi.fn(),
      book_new: vi.fn(() => ({})),
      json_to_sheet: vi.fn(() => ({})),
    },
    writeFile: (...args: unknown[]) => writeFile(...args),
  },
}));

import type { Cell } from 'exceljs';
import {
  detailedStudentNeedsAttention,
  runTutoringExport,
  toDetailedExportRows,
  toPayrollExportRows,
} from './tutoring-export';

const detailedRow = {
  attendance_status: 'DONE',
  content: '=cmd|/c calc',
  date: '2026-08-29',
  duration_minutes: 45,
  group_name: 'Class A',
  id: 'session-1',
  reason_type: 'CUSTOM',
  student_name: 'Mai',
  teacher_name: 'Binh',
  time: '18:00',
} as TutoringDetailedExportRow;

const payrollRow = {
  completed_sessions: 3,
  teacher_name: 'Binh',
  total_minutes: 135,
  total_cong: 3,
} as TutoringPayrollExportRow;

function session(
  id: string,
  studentName: string,
  teacherName: string,
  time: string,
  teacherId?: string | null
): TutoringDetailedExportRow {
  return {
    ...detailedRow,
    id,
    student_name: studentName,
    teacher_name: teacherName,
    teacher_user_id: teacherId,
    time,
  };
}

describe('tutoring export mappers', () => {
  it('renames detailed API fields to display headers', () => {
    expect(toDetailedExportRows([detailedRow])[0]).toEqual({
      AttendanceStatus: 'DONE',
      Content: '=cmd|/c calc',
      Date: '2026-08-29',
      DurationMinutes: 45,
      Group: 'Class A',
      ReasonType: 'CUSTOM',
      Student: 'Mai',
      Teacher: 'Binh',
      Time: '18:00',
    });
  });

  it('gives payroll rows the same display-header treatment', () => {
    expect(toPayrollExportRows([payrollRow])[0]).toEqual({
      CompletedSessions: 3,
      Teacher: 'Binh',
      TotalMinutes: 135,
      TotalCong: 3,
    });
  });

  it('flags a missing teacher and a missing clock time separately', () => {
    expect(detailedStudentNeedsAttention(detailedRow)).toBe(false);
    expect(
      detailedStudentNeedsAttention(
        session('blank-teacher', 'Lan', '', '18:00', null)
      )
    ).toBe(true);
    expect(
      detailedStudentNeedsAttention(session('blank-time', 'Hoa', 'Binh', ''))
    ).toBe(true);
    expect(
      detailedStudentNeedsAttention(
        session('sentinel-teacher', 'An', 'N/A', '09:30', null)
      )
    ).toBe(true);
    expect(
      detailedStudentNeedsAttention(
        session('named-unassigned', 'Cuc', 'Unassigned', '07:15')
      )
    ).toBe(false);
    expect(
      detailedStudentNeedsAttention(
        session('placeholder-time', 'Dao', 'Binh', 'Chưa xác định')
      )
    ).toBe(true);
    expect(
      detailedStudentNeedsAttention(session('midnight', 'Gio', 'Binh', '00:00'))
    ).toBe(false);
    expect(
      detailedStudentNeedsAttention(
        session('unnamed-student', 'N/A', 'Binh', '18:00')
      )
    ).toBe(false);
  });
});

describe('runTutoringExport', () => {
  beforeEach(() => {
    jsonToCSV.mockClear();
    exportTutoringSessions.mockReset();
    writeFile.mockClear();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it('escapes spreadsheet formulae so exported content cannot execute', async () => {
    exportTutoringSessions.mockResolvedValue({
      data: [detailedRow],
      mode: 'detailed',
    });

    await runTutoringExport({
      format: 'detailed-csv',
      query: {},
      wsId: 'ws-1',
    });

    expect(jsonToCSV).toHaveBeenCalledWith(expect.any(Array), {
      escapeFormulae: true,
    });
  });

  it('requests the payroll mode for a payroll format', async () => {
    exportTutoringSessions.mockResolvedValue({
      data: [payrollRow],
      mode: 'payroll',
    });

    await expect(
      runTutoringExport({ format: 'payroll-xlsx', query: {}, wsId: 'ws-1' })
    ).resolves.toBe(1);
    expect(exportTutoringSessions).toHaveBeenCalledWith('ws-1', {
      mode: 'payroll',
    });
    expect(writeFile).toHaveBeenCalled();
  });

  it('refuses a response whose mode does not match the request', async () => {
    exportTutoringSessions.mockResolvedValue({
      data: [payrollRow],
      mode: 'payroll',
    });

    await expect(
      runTutoringExport({ format: 'detailed-csv', query: {}, wsId: 'ws-1' })
    ).rejects.toThrow('Unexpected export mode');
  });

  it('writes a red Student font only for a missing teacher or clock time', async () => {
    const rows = [
      session('complete', 'Mai', 'Binh', '18:00'),
      session('blank-teacher', 'Lan', '', '18:00', null),
      session('blank-time', 'Hoa', 'Binh', ''),
      session('sentinel-teacher', 'An', 'N/A', '09:30', null),
      session('named-unassigned', 'Cuc', 'Unassigned', '07:15'),
      session('placeholder-time', 'Dao', 'Binh', 'Chưa xác định'),
      session('midnight', 'Gio', 'Binh', '00:00'),
      session('unnamed-student', 'N/A', 'Binh', '18:00'),
      session('unnamed-teacher', 'Kim', 'N/A', '18:00', 'teacher-1'),
      session('legacy-unnamed-teacher', 'Linh', 'N/A', '18:00'),
      session('detached-teacher', 'Lien', 'Binh', '18:00', null),
    ];
    exportTutoringSessions.mockResolvedValue({
      data: rows,
      mode: 'detailed',
    });
    let captured: Blob | undefined;
    globalThis.URL.createObjectURL = vi.fn((blob: Blob) => {
      captured = blob;
      return 'blob:detailed';
    });

    await expect(
      runTutoringExport({ format: 'detailed-xlsx', query: {}, wsId: 'ws-1' })
    ).resolves.toBe(rows.length);
    expect(writeFile).not.toHaveBeenCalled();
    if (!(captured instanceof Blob)) {
      throw new Error('Detailed export did not download a workbook');
    }

    const { ValueType, Workbook } = await import('exceljs');
    const workbook = new Workbook();
    const bytes = await captured.arrayBuffer();
    await workbook.xlsx.load(
      bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]
    );
    const sheet = workbook.getWorksheet('Detailed');
    expect(sheet).toBeDefined();
    if (!sheet) return;

    const headerRow = sheet.getRow(1);
    const columnOf = (header: string) => {
      for (let column = 1; column <= headerRow.cellCount; column += 1) {
        if (headerRow.getCell(column).value === header) return column;
      }
      throw new Error(`Missing ${header} column`);
    };
    const studentColumn = columnOf('Student');
    const teacherColumn = columnOf('Teacher');
    const contentColumn = columnOf('Content');
    const durationColumn = columnOf('DurationMinutes');
    const fontArgb = (cell: Cell) => cell.font?.color?.argb;

    expect(fontArgb(headerRow.getCell(studentColumn))).toBeUndefined();

    const rowByStudent = (name: string) => {
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        if (row.getCell(studentColumn).value === name) return row;
      }
      throw new Error(`Missing student ${name}`);
    };

    for (const name of ['Mai', 'Cuc', 'Gio', 'N/A', 'Kim', 'Linh']) {
      const row = rowByStudent(name);
      expect(fontArgb(row.getCell(studentColumn))).toBeUndefined();
      expect(fontArgb(row.getCell(teacherColumn))).toBeUndefined();
    }

    for (const name of ['Lan', 'Hoa', 'An', 'Dao', 'Lien']) {
      const row = rowByStudent(name);
      expect(fontArgb(row.getCell(studentColumn))).toBe('FFFF0000');
      expect(fontArgb(row.getCell(teacherColumn))).toBeUndefined();
      expect(fontArgb(row.getCell(contentColumn))).toBeUndefined();
    }

    const complete = rowByStudent('Mai');
    const content = complete.getCell(contentColumn);
    expect(content.value).toBe('=cmd|/c calc');
    expect(content.type).not.toBe(ValueType.Formula);
    expect(complete.getCell(durationColumn).value).toBe(45);
    expect(rowByStudent('Lan').getCell(teacherColumn).value).toBe('');
    expect(rowByStudent('An').getCell(teacherColumn).value).toBe('N/A');
  });
});
