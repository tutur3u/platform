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

import {
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
} as TutoringPayrollExportRow;

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
    });
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
});
