import {
  getPublicSchemaClient,
  type TopicAnnouncementsSupabaseClient,
} from '@tuturuuu/users-core/routes/topic-announcements';

type AssignedAnnouncementRow = {
  id: string;
  session_date: string | null;
  start_time: string | null;
  teacher_workspace_user_id: string | null;
  title: string;
};

export interface TopicAssignmentNotificationResult {
  /** Announcements without an assigned teacher. */
  unassignedAnnouncements: number;
  /** Teachers whose in-app notification was created. */
  notifiedTeachers: number;
  /** Teachers skipped because no platform account is linked to them. */
  skippedUnlinkedTeachers: number;
  /** Teachers whose notification could not be created. */
  failedTeachers: number;
}

function describeAnnouncements(rows: AssignedAnnouncementRow[]) {
  if (rows.length === 1) {
    const [row] = rows;
    const when = [row?.session_date, row?.start_time?.replace(/:00$/u, '')]
      .filter(Boolean)
      .join(' ');
    return when ? `${row?.title} (${when})` : (row?.title ?? '');
  }
  return `${rows.length} sessions need a topic from you`;
}

/**
 * Creates one `topic_assigned` in-app notification per assigned teacher
 * across the given announcements. Teachers whose workspace user is not linked
 * to a platform account are skipped and counted, never emailed.
 */
export async function notifyTopicAnnouncementTeachers({
  actorUserId,
  announcementIds,
  normalizedWsId,
  sbAdmin,
}: {
  actorUserId: string;
  announcementIds: string[];
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
}): Promise<TopicAssignmentNotificationResult> {
  const { data, error } = await sbAdmin
    .from('topic_announcements')
    .select('id,session_date,start_time,teacher_workspace_user_id,title')
    .eq('ws_id', normalizedWsId)
    .neq('status', 'cancelled')
    .in('id', [...new Set(announcementIds)]);
  if (error) throw error;

  const rows = (data ?? []) as AssignedAnnouncementRow[];
  const byTeacher = new Map<string, AssignedAnnouncementRow[]>();
  for (const row of rows) {
    if (!row.teacher_workspace_user_id) continue;
    const list = byTeacher.get(row.teacher_workspace_user_id) ?? [];
    list.push(row);
    byTeacher.set(row.teacher_workspace_user_id, list);
  }

  const result: TopicAssignmentNotificationResult = {
    failedTeachers: 0,
    notifiedTeachers: 0,
    skippedUnlinkedTeachers: 0,
    unassignedAnnouncements: rows.filter(
      (row) => !row.teacher_workspace_user_id
    ).length,
  };
  if (byTeacher.size === 0) return result;

  const publicAdmin = getPublicSchemaClient(sbAdmin);
  const { data: links, error: linksError } = await publicAdmin
    .from('workspace_user_linked_users')
    .select('platform_user_id,virtual_user_id')
    .eq('ws_id', normalizedWsId)
    .in('virtual_user_id', [...byTeacher.keys()]);
  if (linksError) throw linksError;

  const platformUserByTeacher = new Map<string, string>(
    (links ?? []).map(
      (link: { platform_user_id: string; virtual_user_id: string }) => [
        link.virtual_user_id,
        link.platform_user_id,
      ]
    )
  );

  for (const [teacherWorkspaceUserId, teacherRows] of byTeacher) {
    const platformUserId = platformUserByTeacher.get(teacherWorkspaceUserId);
    if (!platformUserId) {
      result.skippedUnlinkedTeachers += 1;
      continue;
    }

    const { error: notificationError } = await publicAdmin.rpc(
      'create_notification',
      {
        p_created_by: actorUserId,
        p_data: {
          announcement_ids: teacherRows.map((row) => row.id),
          teacher_workspace_user_id: teacherWorkspaceUserId,
        },
        p_description: describeAnnouncements(teacherRows),
        p_entity_id: teacherRows.length === 1 ? teacherRows[0]?.id : undefined,
        p_entity_type: 'topic_announcement',
        p_scope: 'workspace',
        p_title:
          teacherRows.length === 1
            ? 'A session topic was assigned to you'
            : 'Session topics were assigned to you',
        p_type: 'topic_assigned',
        p_user_id: platformUserId,
        p_ws_id: normalizedWsId,
      }
    );
    if (notificationError) {
      console.error('Failed to create topic assignment notification', {
        error: notificationError,
        teacherWorkspaceUserId,
        wsId: normalizedWsId,
      });
      result.failedTeachers += 1;
      continue;
    }
    result.notifiedTeachers += 1;
  }

  return result;
}
