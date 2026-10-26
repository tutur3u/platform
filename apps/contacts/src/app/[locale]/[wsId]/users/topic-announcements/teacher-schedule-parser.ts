/**
 * Pure parser for monthly teacher schedule sheets.
 *
 * Input is the cell matrix of the first worksheet (as produced by
 * `XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: true })`)
 * plus the sheet's merged ranges relative to that matrix. The parser never
 * throws on bad data: every problem becomes a per-row error code so the import
 * preview can show it next to the row.
 */
import {
  addMinutesToTime,
  normalizeScheduleDate,
  normalizeScheduleTime,
} from './teacher-schedule-values';

export const DEFAULT_SCHEDULE_DURATION_MINUTES = 30;
export const MAX_SCHEDULE_DURATION_MINUTES = 600;
const HEADER_SCAN_LIMIT = 20;

export type TeacherScheduleField =
  | 'classLabel'
  | 'contactEmail'
  | 'contactName'
  | 'date'
  | 'day'
  | 'endTime'
  | 'meridiem'
  | 'place'
  | 'room'
  | 'teacherClass'
  | 'teacherName'
  | 'time'
  | 'title'
  | 'topic';

export type TeacherScheduleRowError =
  | 'bad_date'
  | 'bad_time'
  | 'missing_date'
  | 'missing_time'
  | 'teacher_class_unsplit';

export interface TeacherScheduleRow {
  classLabel?: string;
  contactEmail?: string;
  contactName?: string;
  dayLabel?: string;
  endTime?: string;
  place?: string;
  room?: string;
  sessionDate?: string;
  startTime?: string;
  teacherName?: string;
  title?: string;
  topic?: string;
}

export interface ParsedTeacherScheduleRow {
  errors: TeacherScheduleRowError[];
  row: TeacherScheduleRow;
  /** 1-based row number in the sheet, for operator reference. */
  sheetRowNumber: number;
}

export interface SheetMergeRange {
  e: { c: number; r: number };
  s: { c: number; r: number };
}

export interface TeacherScheduleParseOptions {
  durationMinutes?: number;
  merges?: SheetMergeRange[];
  /** Used when a date cell has no year, e.g. `5/10`. */
  referenceYear?: number;
  /** Matrix row 0 is this sheet row (1-based). Defaults to 1. */
  sheetRowOffset?: number;
}

export type TeacherScheduleParseResult =
  | {
      headerRowNumber: number;
      kind: 'schedule';
      rows: ParsedTeacherScheduleRow[];
    }
  | { kind: 'not_schedule' };

// Headers are compared after stripping diacritics and punctuation, so
// "TEACHER-CLASS", "Teacher / Class" and "teacher class" are the same key.
const HEADER_ALIASES: Record<string, TeacherScheduleField> = {
  'am pm': 'meridiem',
  ampm: 'meridiem',
  campus: 'place',
  class: 'classLabel',
  'class name': 'classLabel',
  'co so': 'place',
  'contact email': 'contactEmail',
  'contact name': 'contactName',
  date: 'date',
  day: 'day',
  'dia diem': 'place',
  email: 'contactEmail',
  end: 'endTime',
  'end time': 'endTime',
  'foreign teacher': 'contactName',
  'foreign teacher email': 'contactEmail',
  'giao vien': 'teacherName',
  'giao vien lop': 'teacherClass',
  'giao vien phu trach': 'teacherName',
  gio: 'time',
  'gio bat dau': 'time',
  'gio ket thuc': 'endTime',
  gvnn: 'contactName',
  'gvnn email': 'contactEmail',
  'gvnn lop': 'teacherClass',
  gvvn: 'teacherName',
  location: 'place',
  lop: 'classLabel',
  meridiem: 'meridiem',
  'native teacher': 'contactName',
  ngay: 'date',
  'ngay hoc': 'date',
  phong: 'room',
  place: 'place',
  room: 'room',
  'session date': 'date',
  start: 'time',
  'start time': 'time',
  teacher: 'teacherName',
  'teacher class': 'teacherClass',
  'teacher in charge': 'teacherName',
  thu: 'day',
  time: 'time',
  'tieu de': 'title',
  title: 'title',
  topic: 'topic',
  'chu de': 'topic',
  'ten lop': 'classLabel',
  'vn teacher': 'teacherName',
  weekday: 'day',
};

// A sheet is treated as a teacher schedule only when it carries a column the
// generic announcement template never uses.
const SCHEDULE_MARKER_FIELDS = new Set<TeacherScheduleField>([
  'meridiem',
  'teacherClass',
  'teacherName',
]);

const FORWARD_FILL_FIELDS = ['day', 'date'] as const;

export function stripDiacritics(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D');
}

export function normalizeScheduleHeader(value: unknown) {
  return stripDiacritics(cellText(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isBlank(value: unknown) {
  return cellText(value).length === 0;
}

export function applySheetMerges(
  matrix: unknown[][],
  merges: SheetMergeRange[] = []
) {
  const filled = matrix.map((row) => [...row]);

  const width = filled.reduce((max, row) => Math.max(max, row.length), 0);
  for (const merge of merges) {
    // Clamp to the data area: a sheet can declare merges far beyond its
    // values (or before the parsed origin), which must not drive the loops.
    const startRow = Math.max(0, merge.s.r);
    const endRow = Math.min(filled.length - 1, merge.e.r);
    const startCol = Math.max(0, merge.s.c);
    const endCol = Math.min(width - 1, merge.e.c);
    if (startRow > endRow || startCol > endCol) continue;

    const value = filled[startRow]?.[startCol];
    if (isBlank(value)) continue;

    for (let r = startRow; r <= endRow; r += 1) {
      const row = filled[r];
      if (!row) continue;
      for (let c = startCol; c <= endCol; c += 1) {
        if (isBlank(row[c])) row[c] = value;
      }
    }
  }

  return filled;
}

function mapHeaderRow(cells: unknown[]) {
  const columns = new Map<TeacherScheduleField, number>();
  cells.forEach((cell, index) => {
    const field = HEADER_ALIASES[normalizeScheduleHeader(cell)];
    if (field && !columns.has(field)) columns.set(field, index);
  });
  return columns;
}

function isScheduleHeader(columns: Map<TeacherScheduleField, number>) {
  if (!columns.has('time')) return false;
  if (!(columns.has('date') || columns.has('day'))) return false;
  return [...columns.keys()].some((field) => SCHEDULE_MARKER_FIELDS.has(field));
}

export function findScheduleHeader(matrix: unknown[][]) {
  const limit = Math.min(matrix.length, HEADER_SCAN_LIMIT);
  for (let index = 0; index < limit; index += 1) {
    const columns = mapHeaderRow(matrix[index] ?? []);
    if (isScheduleHeader(columns)) return { columns, index };
  }
  return null;
}

/**
 * Splits a combined "teacher-class" cell. A spaced separator (" - ", " / ",
 * " | ") wins; otherwise the first bare dash or slash is used.
 */
export function splitTeacherClass(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const spaced = trimmed.match(/^(.+?)\s+[-–—/|]\s+(.+)$/u);
  const bare = spaced ?? trimmed.match(/^([^-–—/|]+)[-–—/|](.+)$/u);
  const teacher = bare?.[1]?.trim();
  const classLabel = bare?.[2]?.trim();
  if (!teacher || !classLabel) return null;

  return { classLabel, teacher };
}

function readField(
  cells: unknown[],
  columns: Map<TeacherScheduleField, number>,
  field: TeacherScheduleField
) {
  const index = columns.get(field);
  return index === undefined ? undefined : cells[index];
}

function setText(
  row: TeacherScheduleRow,
  key: keyof TeacherScheduleRow,
  value: unknown
) {
  const text = cellText(value);
  if (text) row[key] = text;
}

function isSeparatorRow(
  cells: unknown[],
  columns: Map<TeacherScheduleField, number>
) {
  return [...columns.entries()]
    .filter(([field]) => !FORWARD_FILL_FIELDS.includes(field as 'day' | 'date'))
    .every(([, index]) => isBlank(cells[index]));
}

function buildRow(
  cells: unknown[],
  columns: Map<TeacherScheduleField, number>,
  carried: { date: unknown; day: unknown },
  options: Required<Pick<TeacherScheduleParseOptions, 'durationMinutes'>> &
    Pick<TeacherScheduleParseOptions, 'referenceYear'>
) {
  const row: TeacherScheduleRow = {};
  const errors: TeacherScheduleRowError[] = [];

  setText(row, 'dayLabel', carried.day);
  setText(row, 'place', readField(cells, columns, 'place'));
  setText(row, 'room', readField(cells, columns, 'room'));
  setText(row, 'teacherName', readField(cells, columns, 'teacherName'));
  setText(row, 'contactName', readField(cells, columns, 'contactName'));
  setText(row, 'classLabel', readField(cells, columns, 'classLabel'));
  setText(row, 'topic', readField(cells, columns, 'topic'));
  setText(row, 'title', readField(cells, columns, 'title'));

  const email = cellText(readField(cells, columns, 'contactEmail'));
  if (email) row.contactEmail = email.toLowerCase();

  const combined = cellText(readField(cells, columns, 'teacherClass'));
  if (combined) {
    const split = splitTeacherClass(combined);
    if (split) {
      row.contactName ??= split.teacher;
      row.classLabel ??= split.classLabel;
    } else {
      row.classLabel ??= combined;
      errors.push('teacher_class_unsplit');
    }
  }

  if (isBlank(carried.date)) {
    errors.push('missing_date');
  } else {
    const date = normalizeScheduleDate(carried.date, options.referenceYear);
    row.sessionDate = date ?? cellText(carried.date);
    if (!date) errors.push('bad_date');
  }

  const rawTime = readField(cells, columns, 'time');
  const meridiem = cellText(readField(cells, columns, 'meridiem'));
  if (isBlank(rawTime)) {
    errors.push('missing_time');
  } else {
    const start = normalizeScheduleTime(rawTime, meridiem);
    row.startTime =
      start ?? [cellText(rawTime), meridiem].filter(Boolean).join(' ');
    const rawEnd = readField(cells, columns, 'endTime');
    const end = isBlank(rawEnd)
      ? start && addMinutesToTime(start, options.durationMinutes)
      : normalizeScheduleTime(rawEnd, meridiem);
    if (end) row.endTime = end;
    if (!start || !end) errors.push('bad_time');
  }

  return { errors, row };
}

export function clampScheduleDuration(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_SCHEDULE_DURATION_MINUTES;
  return Math.min(
    Math.max(Math.round(value), 1),
    MAX_SCHEDULE_DURATION_MINUTES
  );
}

export function parseTeacherSchedule(
  input: unknown[][],
  options: TeacherScheduleParseOptions = {}
): TeacherScheduleParseResult {
  const matrix = applySheetMerges(input, options.merges);
  const header = findScheduleHeader(matrix);
  if (!header) return { kind: 'not_schedule' };

  const offset = options.sheetRowOffset ?? 1;
  const durationMinutes = clampScheduleDuration(
    options.durationMinutes ?? DEFAULT_SCHEDULE_DURATION_MINUTES
  );
  const carried: { date: unknown; day: unknown } = { date: '', day: '' };
  const rows: ParsedTeacherScheduleRow[] = [];

  for (let index = header.index + 1; index < matrix.length; index += 1) {
    const cells = matrix[index] ?? [];
    const day = readField(cells, header.columns, 'day');
    const date = readField(cells, header.columns, 'date');
    if (!isBlank(day)) carried.day = day;
    if (!isBlank(date)) carried.date = date;
    if (isSeparatorRow(cells, header.columns)) continue;

    const { errors, row } = buildRow(cells, header.columns, carried, {
      durationMinutes,
      referenceYear: options.referenceYear,
    });
    rows.push({ errors, row, sheetRowNumber: index + offset });
  }

  return { headerRowNumber: header.index + offset, kind: 'schedule', rows };
}
