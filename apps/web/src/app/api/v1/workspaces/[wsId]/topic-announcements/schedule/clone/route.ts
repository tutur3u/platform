import { NextResponse } from 'next/server';
import { getWorkspaceSchedulingTimezone } from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/shared';
import { resolveScheduleAccess } from '@/lib/topic-schedule/access';
import { cloneScheduleMonth } from '@/lib/topic-schedule/schedule-clone';
import { notifyScheduleTeachers } from '@/lib/topic-schedule/schedule-notify';
import { ScheduleCloneSchema } from '@/lib/topic-schedule/schemas';

interface Params {
  params: Promise<{ wsId: string }>;
}

/**
 * Previews (`dryRun: true`) or commits cloning one month's GVNN schedule
 * into another. Supervisor scope, teacher assignments only.
 */
export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await resolveScheduleAccess(request, wsId);
  if (access.response) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ScheduleCloneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const data = await cloneScheduleMonth(
    {
      actorUserId,
      normalizedWsId,
      sbAdmin,
      timeZone: await getWorkspaceSchedulingTimezone(sbAdmin, normalizedWsId),
    },
    parsed.data
  );
  const notification = await notifyScheduleTeachers({
    actorUserId,
    announcementIds: data.createdIds,
    enabled: !parsed.data.dryRun && parsed.data.notifyTeachers === true,
    normalizedWsId,
    sbAdmin,
  });
  return NextResponse.json({ data: { ...data, notification } });
}
