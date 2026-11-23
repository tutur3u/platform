import 'server-only';
import { isParleySession } from '@tuturuuu/meet-core/parley/repository';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  resolveWorkspaceIdForPrincipal,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';

export class MeetingRecordError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export type MeetingRecordParams = {
  params: Promise<{ wsId: string; meetingId: string }>;
};

/**
 * Resolves the signed-in satellite principal for a meeting record.
 *
 * Reads need full (MEMBER) workspace membership. Editing the record belongs to
 * the meeting host or a workspace admin, and linking a Project also needs
 * manage_projects. task_project_links, meeting_task_links and
 * meeting_record_items are private and reachable only by service_role, with no
 * RLS policies, so this check is the only enforcement of these rules.
 */
export async function meetingRecordAccess(
  request: Request,
  params: MeetingRecordParams,
  mutation = false
) {
  if (
    mutation &&
    request.headers.get('origin') !== new URL(request.url).origin
  ) {
    throw new MeetingRecordError(403, 'Invalid origin');
  }
  const user = await getSatelliteAppSessionUser(MEETING_APP);
  if (!user) throw new MeetingRecordError(401, 'Unauthorized');
  if (MEETING_APP === 'parley')
    throw new MeetingRecordError(404, 'Meeting records are not available');
  const { wsId: rawWsId, meetingId } = await params.params;
  if (!z.uuid().safeParse(meetingId).success)
    throw new MeetingRecordError(400, 'Invalid meeting');
  const db = await createAdminClient();
  let wsId: string;
  try {
    wsId = await resolveWorkspaceIdForPrincipal({
      authorizationClient: db,
      principal: { id: user.id, email: user.email ?? null },
      wsId: rawWsId,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    throw new MeetingRecordError(
      name === 'WorkspaceAuthError'
        ? 403
        : name === 'WorkspaceNotFoundError'
          ? 404
          : 500,
      'Workspace resolution failed'
    );
  }
  const membership = await verifyWorkspaceMembershipType({
    supabase: db,
    userId: user.id,
    wsId,
    requiredType: 'MEMBER',
  });
  if (membership.error === 'membership_lookup_failed')
    throw new MeetingRecordError(500, 'Workspace access lookup failed');
  if (!membership.ok)
    throw new MeetingRecordError(403, 'Workspace access denied');
  const { data: meeting, error } = await db
    .from('workspace_meetings')
    .select('id, creator_id, name, time, ws_id')
    .eq('id', meetingId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error) throw new MeetingRecordError(500, 'Meeting lookup failed');
  if (!meeting) throw new MeetingRecordError(404, 'Meeting not found');
  if (await isParleySession(meeting.id, false))
    throw new MeetingRecordError(403, 'Open this scenario in Parley');
  const permissions = await getPermissions({ wsId: meeting.ws_id, user });
  if (!permissions)
    throw new MeetingRecordError(500, 'Workspace permissions unavailable');
  const isHost = meeting.creator_id === user.id;
  const canEditRecord = isHost || permissions.containsPermission('admin');
  return {
    db,
    user,
    wsId: meeting.ws_id,
    meeting,
    isHost,
    canEditRecord,
    canLinkProjects:
      canEditRecord && permissions.containsPermission('manage_projects'),
  };
}

export type MeetingRecordAccess = Awaited<
  ReturnType<typeof meetingRecordAccess>
>;

export async function meetingRecordResponse(work: () => Promise<unknown>) {
  try {
    return Response.json(await work(), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const known = error instanceof MeetingRecordError;
    if (!known) console.error('Meeting record request failed', error);
    return Response.json(
      { error: known ? error.message : 'Meeting record request failed' },
      {
        status: known ? error.status : 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
