import type { TopicAnnouncementsSupabaseClient } from '@tuturuuu/users-core/routes/topic-announcements';
import {
  addMinutesToScheduleTime,
  TOPIC_SCHEDULE_DEFAULT_DURATION_MINUTES,
} from '@tuturuuu/utils/topic-schedule';
import { planScheduleClone, type ScheduleClonePlanItem } from './clone-plan';
import {
  loadScheduleClasses,
  loadScheduleContacts,
  loadScheduleSessions,
} from './schedule-data';
import {
  insertScheduleSessions,
  type ScheduleSessionWrite,
} from './schedule-write';

export interface ScheduleClonePreviewItem {
  classLabel: string | null;
  endTime: string | null;
  gvnnContactId: string | null;
  reason: ScheduleClonePlanItem['reason'];
  sourceDate: string;
  sourceId: string;
  startTime: string;
  status: ScheduleClonePlanItem['status'];
  targetDate: string | null;
  teacherWorkspaceUserId: string | null;
  weekday: number;
  weekdayOccurrence: number;
}

export interface ScheduleCloneResult {
  createdIds: string[];
  items: ScheduleClonePreviewItem[];
}

/**
 * Previews or commits cloning `sourceMonth` into `targetMonth`. The plan is
 * recomputed on commit against the target as it is now, so committing a
 * stale preview, or committing twice, only creates the missing slots.
 */
export async function cloneScheduleMonth(
  context: {
    actorUserId: string;
    normalizedWsId: string;
    sbAdmin: TopicAnnouncementsSupabaseClient;
    timeZone: string | null;
  },
  {
    dryRun,
    sourceMonth,
    targetMonth,
  }: { dryRun: boolean; sourceMonth: string; targetMonth: string }
): Promise<ScheduleCloneResult> {
  const [classes, sourceSessions, targetSessions] = await Promise.all([
    loadScheduleClasses(context),
    loadScheduleSessions({ ...context, month: sourceMonth }),
    loadScheduleSessions({ ...context, month: targetMonth }),
  ]);
  const contacts = await loadScheduleContacts({
    ...context,
    referencedIds: sourceSessions.map((session) => session.gvnnContactId),
  });
  const activeContactIds = new Set(contacts.map((contact) => contact.id));
  const classById = new Map(classes.map((item) => [item.id, item]));

  const plan = planScheduleClone({
    classes,
    sourceSessions,
    targetMonth,
    targetSessions,
  });

  const items = plan.map((item): ScheduleClonePreviewItem => {
    const { source } = item;
    const gvnnContactId =
      source.gvnnContactId && activeContactIds.has(source.gvnnContactId)
        ? source.gvnnContactId
        : null;
    return {
      classLabel:
        (source.groupId ? classById.get(source.groupId)?.name : null) ??
        source.classLabel,
      endTime: source.endTime,
      gvnnContactId,
      reason: item.reason,
      sourceDate: source.sessionDate,
      sourceId: source.id,
      startTime: source.startTime,
      status: item.status,
      targetDate: item.targetDate,
      teacherWorkspaceUserId: item.teacherWorkspaceUserId,
      weekday: item.weekday,
      weekdayOccurrence: item.weekdayOccurrence,
    };
  });

  if (dryRun) return { createdIds: [], items };

  const writes = plan.flatMap((planItem, index): ScheduleSessionWrite[] => {
    const item = items[index]!;
    const { source } = planItem;
    if (item.status !== 'create' || !item.targetDate || !source.groupId) {
      return [];
    }
    return [
      {
        classLabel: item.classLabel ?? source.groupId,
        endTime:
          source.endTime ??
          addMinutesToScheduleTime(
            source.startTime,
            TOPIC_SCHEDULE_DEFAULT_DURATION_MINUTES
          ) ??
          source.startTime,
        groupId: source.groupId,
        gvnnContactId: item.gvnnContactId,
        place: source.place,
        room: source.room,
        sessionDate: item.targetDate,
        startTime: source.startTime,
        teacherWorkspaceUserId: item.teacherWorkspaceUserId,
      },
    ];
  });

  const createdIds = await insertScheduleSessions({
    ...context,
    sessions: writes,
    sourceName: `clone ${sourceMonth} -> ${targetMonth}`,
  });
  return { createdIds, items };
}
