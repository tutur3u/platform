import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { syncMeetAttendance } from '@tuturuuu/meet-core/features/call/server/attendance';
import {
  canViewMeetAttendance,
  resolveMeetClassRole,
} from '@tuturuuu/meet-core/features/call/server/class-role';
import { roomRoute } from '@tuturuuu/meet-core/features/call/server/room-service';
import {
  allowMeetActorAction,
  attendanceCsv,
  meetClassAttendanceEnabled,
} from '@tuturuuu/realtime/meet';
import { connection } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  await connection();
  if (!meetClassAttendanceEnabled()) return new Response(null, { status: 404 });
  const { meetingId } = await params;
  const format = new URL(request.url).searchParams.get('format');
  return roomRoute(request, meetingId, async (access) => {
    const classRole = await resolveMeetClassRole(access, { required: true });
    if (!canViewMeetAttendance(access, classRole.coHost))
      throw new MeetCallAccessError(403, 'Only the host can view attendance');
    if (
      !allowMeetActorAction(
        'attendance',
        access.user.id,
        `${access.meeting.ws_id}:${access.meeting.id}`
      )
    )
      throw new MeetCallAccessError(429, 'Too many requests');
    const rows = (
      await syncMeetAttendance({
        meetingId: access.meeting.id,
        wsId: access.meeting.ws_id,
        userId: access.user.id,
        isHost: access.isHost,
        displayName: access.displayName,
        canReadWorkspace: access.canReadWorkspace,
        coHost: classRole.coHost,
        now: new Date().toISOString(),
      })
    ).map(({ name, firstJoin, totalMinutes, kind }) => ({
      name,
      firstJoin,
      totalMinutes,
      kind,
    }));
    if (format === 'csv') {
      return new Response(attendanceCsv(rows), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="attendance-${meetingId}.csv"`,
        },
      });
    }
    return { rows };
  });
}
