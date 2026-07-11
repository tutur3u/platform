import type { TopicAnnouncementImportRow } from '@tuturuuu/internal-api';

export const TOPIC_ANNOUNCEMENT_IMPORT_COLUMNS = [
  'day',
  'class',
  'room',
  'date',
  'start time',
  'end time',
  'teacher',
  'email',
  'place',
  'topic',
  'title',
] as const;

export interface TopicAnnouncementImportPreviewRow {
  errors: string[];
  row: TopicAnnouncementImportRow;
  rowNumber: number;
}

const HEADER_ALIASES: Record<string, keyof TopicAnnouncementImportRow> = {
  class: 'classLabel',
  'class name': 'classLabel',
  contact: 'contactName',
  'contact email': 'contactEmail',
  'contact name': 'contactName',
  date: 'sessionDate',
  day: 'dayLabel',
  'địa điểm': 'place',
  email: 'contactEmail',
  'end time': 'endTime',
  'giáo viên': 'contactName',
  giờ: 'startTime',
  'giờ bắt đầu': 'startTime',
  'giờ kết thúc': 'endTime',
  ngày: 'sessionDate',
  'ngày học': 'sessionDate',
  'người liên hệ': 'contactName',
  lop: 'classLabel',
  lớp: 'classLabel',
  'môn học': 'topic',
  'nội dung': 'topic',
  phòng: 'room',
  place: 'place',
  room: 'room',
  'start time': 'startTime',
  teacher: 'contactName',
  time: 'startTime',
  'tiêu đề': 'title',
  title: 'title',
  topic: 'topic',
  'tên lớp': 'classLabel',
  'tên liên hệ': 'contactName',
  'chủ đề': 'topic',
};

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && quoted && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase();
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function isEmptyRow(cells: unknown[]) {
  return cells.every((cell) => normalizeCell(cell).length === 0);
}

export function parseTopicAnnouncementRowsFromMatrix(input: unknown[][]) {
  const rows = input.filter((row) => !isEmptyRow(row));

  if (rows.length < 2) {
    return [];
  }

  const headers = (rows[0] ?? []).map(
    (header) => HEADER_ALIASES[normalizeHeader(normalizeCell(header))] ?? null
  );

  return rows.slice(1).flatMap((cells) => {
    const row: TopicAnnouncementImportRow = {};

    headers.forEach((key, index) => {
      if (!key) return;
      const value = normalizeCell(cells[index]);
      if (value) row[key] = value;
    });

    if (!row.title && row.topic) row.title = row.topic.slice(0, 120);
    if (!row.contactEmail && row.contactName?.includes('@')) {
      row.contactEmail = row.contactName;
    }

    return Object.keys(row).length > 0 ? [row] : [];
  });
}

export function parseTopicAnnouncementCsv(input: string) {
  const lines = input
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  return parseTopicAnnouncementRowsFromMatrix(
    lines.map((line) => splitCsvLine(line))
  );
}

export function validateTopicAnnouncementImportRows(
  rows: TopicAnnouncementImportRow[]
): TopicAnnouncementImportPreviewRow[] {
  return rows.map((row, index) => {
    const errors: string[] = [];

    if (!row.contactEmail?.trim()) {
      errors.push('missing_email');
    }
    if (!row.topic?.trim()) {
      errors.push('missing_topic');
    }

    return {
      errors,
      row,
      rowNumber: index + 1,
    };
  });
}
