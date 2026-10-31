import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTopicAnnouncementsAccess } from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/shared';
import { notifyTopicAnnouncementTeachers } from '@/lib/topic-announcement-teacher-notifications';

const NotifyTeachersSchema = z.object({
  announcementIds: z.array(z.string().uuid()).min(1).max(100),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

/**
 * Supervisor "save & notify": one `topic_assigned` in-app notification per
 * assigned teacher. Supervisor scope only (manage_users).
 */
export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
  });
  if (access.response) return access.response;
  if (!access.context.teacherAssignmentsEnabled) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = NotifyTeachersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const data = await notifyTopicAnnouncementTeachers({
    actorUserId,
    announcementIds: parsed.data.announcementIds,
    normalizedWsId,
    sbAdmin,
  });

  return NextResponse.json({ data });
}
