import type { TopicAnnouncementsSupabaseClient } from '@tuturuuu/users-core/routes/topic-announcements';
import {
  notifyTopicAnnouncementTeachers,
  type TopicAssignmentNotificationResult,
} from '@/lib/topic-announcement-teacher-notifications';

export type ScheduleNotificationOutcome =
  | { failed: false; result: TopicAssignmentNotificationResult }
  | { failed: true; result: null }
  | null;

/**
 * "Save & notify teachers": one `topic_assigned` in-app notification per
 * GVCN for the sessions a save or clone just assigned to them (new sessions,
 * or a different teacher). Unchanged and retried saves assign nothing, so
 * nothing is re-sent; no other state is needed for that. A notification
 * failure never undoes the save: it is reported next to it.
 */
export async function notifyScheduleTeachers({
  actorUserId,
  announcementIds,
  enabled,
  normalizedWsId,
  sbAdmin,
}: {
  actorUserId: string;
  announcementIds: readonly string[];
  enabled: boolean;
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
}): Promise<ScheduleNotificationOutcome> {
  if (!enabled || announcementIds.length === 0) return null;
  try {
    const result = await notifyTopicAnnouncementTeachers({
      actorUserId,
      announcementIds: [...announcementIds],
      normalizedWsId,
      sbAdmin,
    });
    return { failed: false, result };
  } catch (error) {
    console.error('Failed to notify schedule teachers', {
      error,
      wsId: normalizedWsId,
    });
    return { failed: true, result: null };
  }
}
