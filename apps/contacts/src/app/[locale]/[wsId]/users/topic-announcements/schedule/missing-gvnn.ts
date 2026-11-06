import type { DraftSession } from './schedule-draft';

export interface MissingGvnnClass {
  groupId: string | null;
  label: string;
  sessions: DraftSession[];
}

export interface MissingGvnnReminder {
  classes: MissingGvnnClass[];
  total: number;
}

/**
 * Sessions of the month that still need a GVNN, grouped by class. Classes in
 * `exemptGroupIds` (marked as not needing a GVNN) are left out; until that
 * marking exists the set is empty. Locked (already delivered) sessions are
 * not actionable and are skipped.
 */
export function buildMissingGvnnReminder(
  rows: readonly DraftSession[],
  {
    classLabel,
    exemptGroupIds = new Set<string>(),
  }: {
    classLabel: (groupId: string | null) => string;
    exemptGroupIds?: ReadonlySet<string>;
  }
): MissingGvnnReminder {
  const byClass = new Map<string, MissingGvnnClass>();
  for (const row of rows) {
    if (row.gvnnContactId || row.locked) continue;
    if (row.groupId && exemptGroupIds.has(row.groupId)) continue;
    const key = row.groupId ?? '';
    const entry = byClass.get(key) ?? {
      groupId: row.groupId,
      label: classLabel(row.groupId),
      sessions: [],
    };
    entry.sessions.push(row);
    byClass.set(key, entry);
  }

  const classes = [...byClass.values()]
    .map((entry) => ({
      ...entry,
      sessions: [...entry.sessions].sort((left, right) =>
        `${left.sessionDate} ${left.startTime}`.localeCompare(
          `${right.sessionDate} ${right.startTime}`
        )
      ),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return {
    classes,
    total: classes.reduce((sum, entry) => sum + entry.sessions.length, 0),
  };
}
