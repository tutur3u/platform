import { NextResponse } from 'next/server';
import { resolveTopicAnnouncementsAccess } from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/shared';

/**
 * Access to the monthly GVNN schedule: supervisor scope (manage_users) and
 * only while ENABLE_TOPIC_TEACHER_ASSIGNMENTS is on; otherwise a 404, so
 * flag-off workspaces keep exactly the pre-feature module.
 */
export async function resolveScheduleAccess(request: Request, wsId: string) {
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
  });
  if (access.response) return access;
  if (!access.context.teacherAssignmentsEnabled) {
    return {
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }
  return access;
}
