import type { TopicAnnouncementImportRow } from '@tuturuuu/internal-api';
import {
  type MatchableContact,
  type MatchableWorkspaceUser,
  matchContactByName,
  matchWorkspaceUser,
} from './teacher-schedule-matching';
import { isIsoDate, normalizeScheduleTime } from './teacher-schedule-values';

export const BULK_IMPORT_MIN_ROWS = 8;

/**
 * A grid row: the import payload fields plus the teacher name typed or
 * parsed. The teacher id is resolved from the name on preview.
 */
export interface EditableImportRow {
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

export type ImportRowError =
  | 'ambiguous_contact'
  | 'ambiguous_teacher'
  | 'bad_date'
  | 'bad_time'
  | 'missing_date'
  | 'missing_email'
  | 'missing_time'
  | 'unknown_contact'
  | 'unmatched_teacher';

export type ImportRowWarning = 'missing_topic';

export interface ImportRowPreview {
  errors: ImportRowError[];
  row: EditableImportRow;
  rowNumber: number;
  /** Present only when the row has content and no errors. */
  submitRow?: TopicAnnouncementImportRow;
  warnings: ImportRowWarning[];
}

export interface ImportPreviewContext {
  contacts?: MatchableContact[];
  /** Teacher schedule imports require a session date and start time. */
  requireSchedule?: boolean;
  workspaceUsers?: MatchableWorkspaceUser[];
}

export function createEmptyImportRows(
  count = BULK_IMPORT_MIN_ROWS
): EditableImportRow[] {
  return Array.from({ length: count }, () => ({}));
}

export function hasImportRowContent(row: EditableImportRow) {
  return Object.values(row).some((value) => value?.trim());
}

export function padImportRows(rows: EditableImportRow[]) {
  const nextRows = rows.length > 0 ? rows : createEmptyImportRows();
  if (nextRows.length >= BULK_IMPORT_MIN_ROWS) return nextRows;

  return [
    ...nextRows,
    ...createEmptyImportRows(BULK_IMPORT_MIN_ROWS - nextRows.length),
  ];
}

function resolveContactEmail(
  row: EditableImportRow,
  contacts: MatchableContact[],
  errors: ImportRowError[]
) {
  const email = row.contactEmail?.trim();
  if (email) return email;

  const name = row.contactName?.trim();
  if (!name) {
    errors.push('missing_email');
    return undefined;
  }

  const match = matchContactByName(name, contacts);
  if (match.kind === 'matched') return match.value.email;
  errors.push(
    match.kind === 'ambiguous' ? 'ambiguous_contact' : 'unknown_contact'
  );
  return undefined;
}

function resolveTeacherId(
  row: EditableImportRow,
  users: MatchableWorkspaceUser[],
  errors: ImportRowError[]
) {
  const name = row.teacherName?.trim();
  if (!name) return undefined;

  const match = matchWorkspaceUser(name, users);
  if (match.kind === 'matched') return match.value.id;
  errors.push(
    match.kind === 'ambiguous' ? 'ambiguous_teacher' : 'unmatched_teacher'
  );
  return undefined;
}

function checkTime(
  value: string | undefined,
  errors: ImportRowError[]
): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  const normalized = normalizeScheduleTime(text);
  if (!normalized && !errors.includes('bad_time')) errors.push('bad_time');
  return normalized ?? undefined;
}

export function previewImportRow(
  row: EditableImportRow,
  rowNumber: number,
  context: ImportPreviewContext = {}
): ImportRowPreview {
  if (!hasImportRowContent(row)) {
    return { errors: [], row, rowNumber, warnings: [] };
  }

  const errors: ImportRowError[] = [];
  const warnings: ImportRowWarning[] = [];

  const contactEmail = resolveContactEmail(row, context.contacts ?? [], errors);
  const teacherWorkspaceUserId = resolveTeacherId(
    row,
    context.workspaceUsers ?? [],
    errors
  );

  const sessionDate = row.sessionDate?.trim();
  if (sessionDate && !isIsoDate(sessionDate)) errors.push('bad_date');
  if (!sessionDate && context.requireSchedule) errors.push('missing_date');

  const startTime = checkTime(row.startTime, errors);
  const endTime = checkTime(row.endTime, errors);
  if (context.requireSchedule) {
    if (!row.startTime?.trim()) errors.push('missing_time');
    // Schedule rows always carry an end time (start + session length); a
    // missing one means the session would run past midnight.
    else if (startTime && !endTime && !errors.includes('bad_time')) {
      errors.push('bad_time');
    }
  }

  if (!row.topic?.trim()) warnings.push('missing_topic');

  const preview: ImportRowPreview = { errors, row, rowNumber, warnings };
  if (errors.length > 0) return preview;

  const { teacherName: _teacherName, ...payloadRow } = row;
  return {
    ...preview,
    submitRow: {
      ...payloadRow,
      contactEmail,
      ...(endTime ? { endTime } : {}),
      ...(startTime ? { startTime } : {}),
      ...(teacherWorkspaceUserId ? { teacherWorkspaceUserId } : {}),
    },
  };
}

export function previewImportRows(
  rows: EditableImportRow[],
  context: ImportPreviewContext = {}
) {
  return rows.map((row, index) => previewImportRow(row, index + 1, context));
}
