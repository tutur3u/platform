import {
  mapToSameNthWeekday,
  type ScheduleClass,
  type ScheduleSession,
  scheduleSlotKey,
  scheduleWeekday,
  scheduleWeekdayOccurrence,
} from '@tuturuuu/utils/topic-schedule';

export type ScheduleClonePlanStatus = 'create' | 'exists' | 'unplaced';
export type ScheduleCloneUnplacedReason = 'class_removed' | 'no_such_weekday';

export interface ScheduleClonePlanItem {
  /** Target date, or null when the session cannot be placed. */
  targetDate: string | null;
  reason: ScheduleCloneUnplacedReason | null;
  source: ScheduleSession;
  status: ScheduleClonePlanStatus;
  /** GVCN resolved from the class's current teachers. */
  teacherWorkspaceUserId: string | null;
  weekday: number;
  weekdayOccurrence: number;
}

/**
 * Plans cloning one month's schedule into another. Each source session maps
 * to the same nth weekday of the target month (2nd Tuesday to 2nd Tuesday),
 * which keeps a class's 2-3 monthly GVNN sessions on the same weeks; filling
 * every matching weekday would give 4-5. A 5th weekday the target lacks is
 * `unplaced`, never moved to another date. A slot (class, date, start) that
 * already exists in the target, or was planned earlier in this run, is
 * `exists`, so re-cloning or retrying never duplicates. There is no holiday
 * calendar: every mapped date is kept.
 */
export function planScheduleClone({
  classes,
  sourceSessions,
  targetMonth,
  targetSessions,
}: {
  classes: readonly ScheduleClass[];
  sourceSessions: readonly ScheduleSession[];
  targetMonth: string;
  targetSessions: readonly ScheduleSession[];
}): ScheduleClonePlanItem[] {
  const classById = new Map(classes.map((item) => [item.id, item]));
  const taken = new Set(targetSessions.map(scheduleSlotKey));

  const ordered = [...sourceSessions].sort((left, right) =>
    `${left.sessionDate} ${left.startTime} ${left.classLabel}`.localeCompare(
      `${right.sessionDate} ${right.startTime} ${right.classLabel}`
    )
  );

  return ordered.map((source) => {
    const weekday = scheduleWeekday(source.sessionDate);
    const weekdayOccurrence = scheduleWeekdayOccurrence(source.sessionDate);
    const scheduleClass = source.groupId
      ? classById.get(source.groupId)
      : undefined;
    const base = { source, weekday, weekdayOccurrence };

    if (!scheduleClass) {
      return {
        ...base,
        reason: 'class_removed' as const,
        status: 'unplaced' as const,
        targetDate: null,
        teacherWorkspaceUserId: null,
      };
    }

    const teacherWorkspaceUserId = scheduleClass.primaryTeacherId;
    const targetDate = mapToSameNthWeekday(source.sessionDate, targetMonth);
    if (!targetDate) {
      return {
        ...base,
        reason: 'no_such_weekday' as const,
        status: 'unplaced' as const,
        targetDate: null,
        teacherWorkspaceUserId,
      };
    }

    const key = scheduleSlotKey({
      groupId: source.groupId,
      sessionDate: targetDate,
      startTime: source.startTime,
    });
    const status = taken.has(key) ? ('exists' as const) : ('create' as const);
    taken.add(key);
    return {
      ...base,
      reason: null,
      status,
      targetDate,
      teacherWorkspaceUserId,
    };
  });
}
