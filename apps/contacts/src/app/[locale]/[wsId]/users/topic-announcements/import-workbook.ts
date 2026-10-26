import { XLSX } from '@tuturuuu/ui/xlsx';
import type { EditableImportRow } from './import-row-preview';
import {
  parseTopicAnnouncementRowsFromMatrix,
  TOPIC_ANNOUNCEMENT_IMPORT_COLUMNS,
} from './import-utils';
import {
  parseTeacherSchedule,
  type SheetMergeRange,
} from './teacher-schedule-parser';

export interface ParsedImportWorkbook {
  kind: 'generic' | 'schedule';
  rows: EditableImportRow[];
}

type WorkSheet = Parameters<typeof XLSX.utils.sheet_to_json>[0];

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export function downloadTopicAnnouncementTemplate() {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(
    [
      {
        class: 'EGET1',
        date: '2026-06-01',
        day: 'Monday',
        email: 'teacher@example.com',
        'end time': '18:00',
        place: 'Center 1',
        room: 'A201',
        'start time': '17:00',
        teacher: 'Teacher Name',
        title: 'Unit 3 speaking practice',
        topic: 'Unit 3 speaking practice',
      },
    ],
    { header: [...TOPIC_ANNOUNCEMENT_IMPORT_COLUMNS] }
  );

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Announcements');
  const excelBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  });
  downloadBlob(
    new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'topic-announcements-template.xlsx'
  );
}

/** Merged ranges are absolute; the matrix starts at the sheet range origin. */
function relativeMerges(sheet: WorkSheet): {
  merges: SheetMergeRange[];
  rowOffset: number;
} {
  const ref = sheet['!ref'];
  const origin = ref ? XLSX.utils.decode_range(ref).s : { c: 0, r: 0 };
  const merges = (sheet['!merges'] ?? []).map((merge) => ({
    e: { c: merge.e.c - origin.c, r: merge.e.r - origin.r },
    s: { c: merge.s.c - origin.c, r: merge.s.r - origin.r },
  }));
  return { merges, rowOffset: origin.r + 1 };
}

export async function parseImportWorkbook(
  file: File,
  durationMinutes: number
): Promise<ParsedImportWorkbook> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
  if (!sheet) return { kind: 'generic', rows: [] };

  // Raw values keep Excel date serials and time fractions unambiguous.
  const rawMatrix = XLSX.utils.sheet_to_json(sheet, {
    blankrows: true,
    defval: '',
    header: 1,
    raw: true,
  }) as unknown[][];
  const { merges, rowOffset } = relativeMerges(sheet);
  const schedule = parseTeacherSchedule(rawMatrix, {
    durationMinutes,
    merges,
    referenceYear: new Date().getFullYear(),
    sheetRowOffset: rowOffset,
  });
  if (schedule.kind === 'schedule') {
    return { kind: 'schedule', rows: schedule.rows.map(({ row }) => row) };
  }

  const displayMatrix = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    header: 1,
    raw: false,
  }) as unknown[][];
  return {
    kind: 'generic',
    rows: parseTopicAnnouncementRowsFromMatrix(displayMatrix),
  };
}
