import type { AttendanceInterval } from '@tuturuuu/realtime/meet';
import { ATTENDANCE_PAGE_SIZE } from '@tuturuuu/realtime/meet';

export type AttendanceStoredRow = {
  sourceKey: string;
  wsId: string;
  kind: 'member' | 'guest';
  userId: string | null;
  guestId: string | null;
  displayName: string;
  joinedAt: string;
  leftAt: string | null;
};

function canonicalTimestamp(value: string | null) {
  if (!value) return '';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
}

export function attendanceWriteSignature(row: {
  kind: 'member' | 'guest';
  userId: string | null;
  guestId: string | null;
  displayName: string;
  joinedAt: string;
  leftAt: string | null;
}) {
  return [
    row.kind,
    row.userId ?? '',
    row.guestId ?? '',
    row.displayName,
    canonicalTimestamp(row.joinedAt),
    canonicalTimestamp(row.leftAt),
  ].join('\u0000');
}

export async function commitFencedUpsert(input: {
  epoch: number;
  readGeneration: () => Promise<number>;
  write: () => Promise<void>;
  compensate: () => Promise<void>;
}) {
  if ((await input.readGeneration()) > input.epoch)
    throw new Error('Meet attendance sync was fenced');
  await input.write();
  if ((await input.readGeneration()) > input.epoch) {
    await input.compensate();
    throw new Error('Meet attendance sync was fenced');
  }
}

/** Inserts use the caller's workspace. An existing row keeps the workspace that collected it. */
export function planAttendanceUpsert(
  existing: AttendanceStoredRow[],
  incoming: AttendanceInterval[],
  wsId: string
) {
  const byKey = new Map(existing.map((row) => [row.sourceKey, row]));
  const insert: AttendanceInterval[] = [];
  const update: AttendanceInterval[] = [];
  for (const row of incoming) {
    const prior = byKey.get(row.sourceKey);
    if (!prior) {
      insert.push(row);
      continue;
    }
    if (prior.wsId !== wsId) continue;
    const next = attendanceWriteSignature({
      kind: row.kind,
      userId: row.kind === 'member' ? (row.userId ?? null) : null,
      guestId: row.kind === 'guest' ? (row.guestId ?? null) : null,
      displayName: row.displayName,
      joinedAt: row.joinedAt,
      leftAt: row.leftAt ?? null,
    });
    if (next !== attendanceWriteSignature(prior)) update.push(row);
  }
  return { insert, update };
}

export async function readAttendancePages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>
) {
  const rows: T[] = [];
  for (let from = 0; ; from += ATTENDANCE_PAGE_SIZE) {
    const page = await fetchPage(from, from + ATTENDANCE_PAGE_SIZE - 1);
    rows.push(...page);
    if (page.length < ATTENDANCE_PAGE_SIZE) return rows;
  }
}
