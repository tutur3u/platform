import 'server-only';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';

export class MeetAiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
export type MeetAiParams = {
  params: Promise<{ wsId: string; meetingId: string }>;
};

export async function meetAiAccess(
  request: Request,
  params: MeetAiParams,
  mutation = false
) {
  if (
    mutation &&
    request.headers.get('origin') !== new URL(request.url).origin
  ) {
    throw new MeetAiError(403, 'Invalid origin');
  }
  const user = await getSatelliteAppSessionUser('meet');
  if (!user) throw new MeetAiError(401, 'Unauthorized');
  const { wsId: rawWsId, meetingId } = await params.params;
  if (!z.uuid().safeParse(meetingId).success)
    throw new MeetAiError(400, 'Invalid meeting');
  // The satellite principal has already been verified against the signed app
  // session. Every admin lookup below is scoped to that explicit principal.
  const db = await createAdminClient();
  let wsId: string;
  try {
    wsId = await normalizeWorkspaceId(rawWsId, db);
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    throw new MeetAiError(
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
  });
  if (!membership.ok)
    throw new MeetAiError(
      membership.error === 'membership_lookup_failed' ? 500 : 403,
      'Workspace access denied'
    );
  const { data: meeting, error } = await db
    .from('workspace_meetings')
    .select('id, creator_id')
    .eq('id', meetingId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error) throw new MeetAiError(500, 'Meeting lookup failed');
  if (!meeting) throw new MeetAiError(404, 'Meeting not found');
  const canManage = meeting.creator_id === user.id;
  if (mutation && !canManage)
    throw new MeetAiError(
      403,
      'Only the meeting host can manage transcription'
    );
  return { db, meetingId, user, canManage };
}

export async function meetAiResponse(work: () => Promise<unknown>) {
  try {
    return Response.json(await work(), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MeetAiError
            ? error.message
            : 'Meeting AI request failed',
      },
      {
        status: error instanceof MeetAiError ? error.status : 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
