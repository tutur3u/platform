import 'server-only';
import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { isMeetingNotesAdmin } from '@tuturuuu/meet-core/features/meeting-ai/server/notes-admin';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

type ClassAccess = {
  isHost: boolean;
  canReadWorkspace: boolean;
  user: { id: string };
  meeting: { ws_id: string };
};

export async function resolveMeetClassRole(
  access: ClassAccess,
  options?: { required?: boolean }
) {
  const participantKind =
    access.isHost || access.canReadWorkspace ? 'member' : 'guest';
  if (access.isHost || !access.canReadWorkspace)
    return { coHost: false, participantKind } as const;
  try {
    const coHost = await isMeetingNotesAdmin({
      supabase: await createAdminClient({ noCookie: true }),
      wsId: access.meeting.ws_id,
      userId: access.user.id,
    });
    return { coHost, participantKind } as const;
  } catch (error) {
    if (options?.required)
      throw new MeetCallAccessError(503, 'Attendance is unavailable');
    console.warn('Meet co-host lookup failed', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return { coHost: false, participantKind } as const;
  }
}

export function canViewMeetAttendance(
  access: { isHost: boolean; canReadWorkspace: boolean },
  isAdmin: boolean
) {
  return access.isHost || (access.canReadWorkspace && isAdmin);
}
