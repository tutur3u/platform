import 'server-only';
import { WorkspaceStorageError } from '@tuturuuu/storage-core/workspace-storage-provider';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getMeetCallAccess, MeetCallAccessError } from '../lib/call-access';
import { getMeetCallSession } from '../lib/call-session';

export async function callRoomService<T>(
  access: Awaited<ReturnType<typeof getMeetCallAccess>>,
  command: unknown
): Promise<T> {
  const session = await getMeetCallSession({
    meetingId: access.meeting.id,
    wsId: access.meeting.ws_id,
    userId: access.user.id,
    isHost: access.isHost,
    displayName: access.displayName,
    service: true,
    workspaceMember: access.canReadWorkspace,
  });
  const url = new URL(session.realtimeUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '/room-service';
  url.search = '';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });
  if (!response.ok)
    throw new MeetCallAccessError(
      response.status,
      'Room action is unavailable'
    );
  return response.json() as Promise<T>;
}
export async function personalWorkspace(userId: string) {
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db
    .from('workspaces')
    .select('id')
    .eq('creator_id', userId)
    .eq('personal', true)
    .is('deleted_at', null)
    .single();
  if (error || !data)
    throw new MeetCallAccessError(503, 'Personal workspace is unavailable');
  return data.id;
}
export async function roomRoute(
  request: Request,
  meetingId: string,
  run: (
    access: Awaited<ReturnType<typeof getMeetCallAccess>>
  ) => Promise<unknown>
) {
  try {
    if (
      request.method !== 'GET' &&
      request.headers.get('origin') !== new URL(request.url).origin
    )
      throw new MeetCallAccessError(403, 'Invalid origin');
    const access = await getMeetCallAccess(meetingId, 'Participant');
    const result = await run(access);
    if (result instanceof Response) {
      result.headers.set('Cache-Control', 'private, no-store');
      return result;
    }
    return Response.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const status =
      error instanceof MeetCallAccessError ||
      error instanceof WorkspaceStorageError
        ? error.status
        : 500;
    if (status >= 500)
      console.error('Meet room action failed', {
        name: error instanceof Error ? error.name : 'unknown',
      });
    return Response.json(
      {
        error:
          error instanceof MeetCallAccessError
            ? error.message
            : 'Room action failed',
      },
      { status, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
