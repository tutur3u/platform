import type { TopicAnnouncementImportRow } from '@tuturuuu/internal-api';

const HEADER_ALIASES: Record<string, keyof TopicAnnouncementImportRow> = {
  class: 'classLabel',
  'class name': 'classLabel',
  contact: 'contactName',
  'contact email': 'contactEmail',
  'contact name': 'contactName',
  date: 'sessionDate',
  day: 'dayLabel',
  email: 'contactEmail',
  'end time': 'endTime',
  'giờ kết thúc': 'endTime',
  lop: 'classLabel',
  lớp: 'classLabel',
  place: 'place',
  room: 'room',
  teacher: 'contactName',
  time: 'startTime',
  title: 'title',
  topic: 'topic',
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

export function parseTopicAnnouncementCsv(input: string) {
  const lines = input
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = splitCsvLine(lines[0] ?? '').map(
    (header) => HEADER_ALIASES[normalizeHeader(header)] ?? null
  );

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: TopicAnnouncementImportRow = {};

    headers.forEach((key, index) => {
      if (!key) return;
      const value = cells[index]?.trim();
      if (value) row[key] = value;
    });

    if (!row.title && row.topic) row.title = row.topic.slice(0, 120);
    if (!row.contactEmail && row.contactName?.includes('@')) {
      row.contactEmail = row.contactName;
    }

    return row;
  });
}
