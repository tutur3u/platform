import { NextResponse } from 'next/server';
import type { z } from 'zod';
import {
  getPublicSchemaClient,
  type TopicAnnouncementsSupabaseClient,
} from '../server-helpers';
import { normalizeEmail, type TopicAnnouncementImportSchema } from '../shared';

type ImportRowInput = z.infer<
  typeof TopicAnnouncementImportSchema
>['rows'][number];

export interface NormalizedImportRow {
  classLabel: string | null;
  contactEmail: string;
  contactName: string;
  dayLabel: string | null;
  endTime: string | null;
  place: string | null;
  room: string | null;
  rowNumber: number;
  sessionDate: string | null;
  startTime: string | null;
  teacherWorkspaceUserId: string | null;
  title: string;
  topic: string | null;
}

export interface ImportRowError {
  message: string;
  rowNumber: number;
}

export function normalizeImportTime(value?: string) {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?$/iu
  );
  if (!match) return null;

  const [, hourRaw = '0', minuteRaw = '0', meridiemRaw] = match;
  let hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (minute < 0 || minute > 59) return null;

  const meridiem = meridiemRaw?.toUpperCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = meridiem === 'PM' ? (hour % 12) + 12 : hour % 12;
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function trimOrNull(value?: string) {
  return value?.trim() || null;
}

/**
 * Validates and normalizes import rows. Rows without a topic are allowed and
 * become drafts; their title falls back to the class, date and start time.
 */
export function normalizeImportRows(rows: ImportRowInput[]) {
  const rowErrors: ImportRowError[] = [];

  const validRows = rows.flatMap((row, index): NormalizedImportRow[] => {
    const rowNumber = index + 1;
    const errorCount = rowErrors.length;
    const contactEmail = row.contactEmail
      ? normalizeEmail(row.contactEmail)
      : null;
    const topic = trimOrNull(row.topic);
    const startTime = normalizeImportTime(row.startTime);
    const endTime = normalizeImportTime(row.endTime);
    const title =
      trimOrNull(row.title) ??
      topic?.slice(0, 120) ??
      ([row.classLabel?.trim(), row.sessionDate, startTime?.slice(0, 5)]
        .filter(Boolean)
        .join(' ')
        .slice(0, 120) ||
        null);

    if (!contactEmail) {
      rowErrors.push({ message: 'Missing contact email', rowNumber });
    }
    if (row.startTime?.trim() && !startTime) {
      rowErrors.push({ message: 'Invalid start time', rowNumber });
    }
    if (row.endTime?.trim() && !endTime) {
      rowErrors.push({ message: 'Invalid end time', rowNumber });
    }
    if (!title) {
      rowErrors.push({ message: 'Missing topic or title', rowNumber });
    }
    if (!contactEmail || !title || rowErrors.length > errorCount) return [];

    return [
      {
        classLabel: trimOrNull(row.classLabel),
        contactEmail,
        contactName: row.contactName?.trim() || contactEmail,
        dayLabel: trimOrNull(row.dayLabel),
        endTime,
        place: trimOrNull(row.place),
        room: trimOrNull(row.room),
        rowNumber,
        sessionDate: row.sessionDate ?? null,
        startTime,
        teacherWorkspaceUserId: row.teacherWorkspaceUserId ?? null,
        title,
        topic,
      },
    ];
  });

  return { rowErrors, validRows };
}

/**
 * Rejects the request when any teacher id is not a workspace user of this
 * workspace. The database trigger enforces the same rule; this returns a
 * clean 400 before anything is written.
 */
export async function validateImportTeacherIds({
  normalizedWsId,
  rows,
  sbAdmin,
}: {
  normalizedWsId: string;
  rows: { rowNumber: number; teacherWorkspaceUserId: string | null }[];
  sbAdmin: TopicAnnouncementsSupabaseClient;
}) {
  const teacherIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.teacherWorkspaceUserId ? [row.teacherWorkspaceUserId] : []
      )
    ),
  ];
  if (teacherIds.length === 0) return null;

  const { data, error } = await getPublicSchemaClient(sbAdmin)
    .from('workspace_users')
    .select('id')
    .eq('ws_id', normalizedWsId)
    .in('id', teacherIds);
  if (error) throw error;

  const found = new Set((data ?? []).map((user: { id: string }) => user.id));
  const invalidRowNumbers = rows
    .filter(
      (row) =>
        row.teacherWorkspaceUserId && !found.has(row.teacherWorkspaceUserId)
    )
    .map((row) => row.rowNumber);
  if (invalidRowNumbers.length === 0) return null;

  return NextResponse.json(
    {
      message: 'Teacher is not a workspace user of this workspace',
      rowNumbers: invalidRowNumbers,
    },
    { status: 400 }
  );
}
